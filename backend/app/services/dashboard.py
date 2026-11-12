"""Shared, role-scoped read model for dashboards and progress reports.

Related records are fetched in batches. Calendar ranges never cause one query per
day, and current survival is computed independently of the chart period.
"""

from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from urllib.parse import urlencode

from sqlalchemy import and_, false, or_, select
from sqlalchemy.orm import Session, joinedload

from app.domain.errors import DomainError
from app.models.entities import (
    Advisory,
    Distribution,
    Farmer,
    GrowthMeasurement,
    Harvest,
    IndividualTree,
    LifecycleEvent,
    MaintenanceActivity,
    PlantingBatch,
    PlantingSite,
    Sale,
    SeedlingLot,
    User,
)
from app.schemas.valuechain import (
    ActivityDay,
    ActivitySlice,
    AgentBoardResponse,
    AgentBoardRow,
    AgentIssue,
    AgentPlaceCount,
    AgentRegistration,
    AgentSpeciesOption,
    AnalyticsResponse,
    DashboardAgent,
    DashboardAttention,
    DashboardDistrictCount,
    DashboardFilters,
    DashboardOptions,
    DashboardRecent,
    DashboardResponse,
    DashboardSeriesPoint,
    DashboardSpeciesCount,
    DashboardSummary,
    DashboardValueChain,
    DistrictTotal,
    SpeciesCount,
    SpeciesTotal,
)
from app.services.common import utcnow

MAX_DAILY_BUCKETS = 3660
MAX_MONTHLY_BUCKETS = 1200


def household_id(db: Session, user: User | None) -> uuid.UUID | None:
    if user is None or user.role != "farmer":
        return None
    return db.scalar(select(Farmer.id).where(Farmer.user_id == user.id))


def inventory_scope(model, user: User | None, farmer_id: uuid.UUID | None):
    if user is None or user.role in {"admin", "viewer"}:
        return True
    if user.role == "field_officer":
        return model.registered_by == user.id
    if farmer_id is None:
        return false()
    if model is PlantingSite:
        return model.farmer_id == farmer_id
    sites = select(PlantingSite.id).where(PlantingSite.farmer_id == farmer_id)
    return or_(
        model.farmer_id == farmer_id,
        and_(model.farmer_id.is_(None), model.site_id.in_(sites)),
    )


@dataclass
class Inventory:
    sites: list
    trees: list
    batches: list
    farmer_id: uuid.UUID | None

    @property
    def plantings(self):
        return [*self.trees, *self.batches]


def read_inventory(db: Session, user: User | None) -> Inventory:
    farmer_id = household_id(db, user)
    sites = list(
        db.scalars(select(PlantingSite).where(inventory_scope(PlantingSite, user, farmer_id)))
    )
    planted = []
    for model in (IndividualTree, PlantingBatch):
        planted.append(
            list(
                db.scalars(
                    select(model)
                    .where(inventory_scope(model, user, farmer_id))
                    .options(joinedload(model.site), joinedload(model.species))
                )
            )
        )
    return Inventory(sites, planted[0], planted[1], farmer_id)


def row_district(row) -> str | None:
    site = getattr(row, "site", None)
    if site is not None and site.district:
        return site.district
    return getattr(row, "district", None) or None


def planting_amount(row) -> int:
    return row.quantity if isinstance(row, PlantingBatch) else 1


def standing_amount(row) -> int:
    if row.status in {"dead", "removed"}:
        return 0
    return planting_amount(row)


def health_amounts(inventory: Inventory) -> tuple[int, int, int]:
    """Trees recorded as surviving, stressed, or dead.

    Planted trees and trees with no condition stay out of this split. A batch
    quantity counts as that many trees, using the condition on the batch.
    """
    totals = {"surviving": 0, "stressed": 0, "dead": 0}
    for row in inventory.plantings:
        if row.status in totals:
            totals[row.status] += planting_amount(row)
    return totals["surviving"], totals["stressed"], totals["dead"]


def filter_inventory(
    inventory: Inventory, district: str | None, species_id: uuid.UUID | None
) -> Inventory:
    def matches(row):
        return (not district or (row_district(row) or "").casefold() == district.casefold()) and (
            species_id is None or row.species_id == species_id
        )

    trees = [row for row in inventory.trees if matches(row)]
    batches = [row for row in inventory.batches if matches(row)]
    selected_sites = {row.site_id for row in [*trees, *batches]}
    sites = [
        row
        for row in inventory.sites
        if (not district or (row.district or "").casefold() == district.casefold())
        and (species_id is None or row.id in selected_sites)
    ]
    return Inventory(sites, trees, batches, inventory.farmer_id)


def targets(model, inventory: Inventory, *, include_sites: bool = False):
    conditions = [
        model.tree_id.in_([row.id for row in inventory.trees]),
        model.batch_id.in_([row.id for row in inventory.batches]),
    ]
    if include_sites:
        conditions.append(model.site_id.in_([row.id for row in inventory.sites]))
    return or_(*conditions)


@dataclass
class Outcomes:
    events: list
    growth: list
    maintenance: list
    harvests: list
    sales: list


def read_outcomes(db: Session, inventory: Inventory) -> Outcomes:
    events = list(
        db.scalars(
            select(LifecycleEvent).where(targets(LifecycleEvent, inventory, include_sites=True))
        )
    )
    growth = list(
        db.scalars(select(GrowthMeasurement).where(targets(GrowthMeasurement, inventory)))
    )
    maintenance = list(
        db.scalars(
            select(MaintenanceActivity).where(
                targets(MaintenanceActivity, inventory, include_sites=True)
            )
        )
    )
    harvests = list(db.scalars(select(Harvest).where(targets(Harvest, inventory))))
    sales = list(db.scalars(select(Sale).where(Sale.harvest_id.in_([row.id for row in harvests]))))
    return Outcomes(events, growth, maintenance, harvests, sales)


def survival_figures(inventory: Inventory, outcomes: Outcomes) -> tuple[int, int, int | None]:
    checked_ids = {row.tree_id for row in outcomes.events if row.tree_id is not None}
    checked = sum(
        row.id in checked_ids or row.status not in {"planted", "unknown"} for row in inventory.trees
    )
    alive = sum(row.status in {"surviving", "stressed"} for row in inventory.trees)
    # Select by observation date, then creation time and ID for deterministic ties.
    latest = {}
    for row in [*outcomes.events, *outcomes.growth]:
        if row.batch_id is None or row.survival_count is None:
            continue
        observed = row.event_date if isinstance(row, LifecycleEvent) else row.measured_on
        key = (observed, row.created_at.isoformat(), str(row.id))
        if row.batch_id not in latest or key > latest[row.batch_id][0]:
            latest[row.batch_id] = (key, row.survival_count)
    for row in inventory.batches:
        if row.id in latest:
            checked += row.quantity
            alive += min(row.quantity, latest[row.id][1])
    return checked, alive, round(100 * alive / checked) if checked else None


def resolve_period(
    range_name: str, start: date | None, end: date | None, earliest: date
) -> tuple[date, date, bool]:
    if range_name not in {"30", "90", "ytd", "all"}:
        raise DomainError("Choose 30, 90, ytd, or all.", field="range")
    today = utcnow().date()
    end = end or today
    default_start = (
        min(earliest, end)
        if range_name == "all"
        else date(end.year, 1, 1)
        if range_name == "ytd"
        else end - timedelta(days=min(int(range_name) - 1, (end - date.min).days))
    )
    start = start or default_start
    if start > end:
        raise DomainError("End date must be on or after start date.", field="end_date")
    if end > today:
        raise DomainError("End date cannot be in the future.", field="end_date")
    monthly = range_name == "all"
    count = (
        (end.year - start.year) * 12 + end.month - start.month + 1
        if monthly
        else (end - start).days + 1
    )
    if count > (MAX_MONTHLY_BUCKETS if monthly else MAX_DAILY_BUCKETS):
        raise DomainError("The requested date range is too large.", field="start_date")
    return start, end, monthly


def earliest_observation(inventory: Inventory, outcomes: Outcomes) -> date:
    days = [row.planting_date for row in inventory.plantings]
    days += [row.event_date for row in outcomes.events]
    days += [row.measured_on for row in outcomes.growth]
    days += [row.performed_on for row in outcomes.maintenance]
    days += [row.harvested_on for row in outcomes.harvests]
    days += [row.sold_on for row in outcomes.sales]
    return min(days, default=utcnow().date())


def series_for(
    inventory: Inventory, outcomes: Outcomes, start: date, end: date, monthly: bool, viewer: bool
):
    values = defaultdict(
        lambda: {"planted": 0, "activity": 0, "harvested_kg": 0.0, "sales_rwf": 0.0}
    )

    def add(day, field, amount):
        if start <= day <= end:
            key = day.replace(day=1) if monthly else day
            values[key][field] += amount

    for row in inventory.plantings:
        add(row.planting_date, "planted", row.quantity if isinstance(row, PlantingBatch) else 1)
    for rows, day_field in (
        (outcomes.events, "event_date"),
        (outcomes.growth, "measured_on"),
        (outcomes.maintenance, "performed_on"),
    ):
        for row in rows:
            add(getattr(row, day_field), "activity", 1)
    for row in outcomes.harvests:
        if row.unit == "kg":
            add(row.harvested_on, "harvested_kg", row.quantity)
    for row in outcomes.sales:
        add(row.sold_on, "sales_rwf", row.amount_rwf)
    result = []
    day = start.replace(day=1) if monthly else start
    while day <= end:
        bucket = values[day]
        result.append(
            DashboardSeriesPoint(
                day=day,
                **{
                    **bucket,
                    "harvested_kg": None if viewer else bucket["harvested_kg"],
                    "sales_rwf": None if viewer else bucket["sales_rwf"],
                },
            )
        )
        day = (
            date(day.year + (day.month == 12), 1 if day.month == 12 else day.month + 1, 1)
            if monthly
            else day + timedelta(days=1)
        )
    return result


def farmer_count(db: Session, inventory: Inventory, user: User | None, filtered: bool) -> int:
    ids = {
        row.farmer_id or (row.site.farmer_id if row.site is not None else None)
        for row in inventory.plantings
    }
    ids.update(row.farmer_id for row in inventory.sites)
    if not filtered:
        statement = select(Farmer.id)
        if user is not None and user.role == "field_officer":
            statement = statement.where(Farmer.registered_by == user.id)
        elif user is not None and user.role == "farmer":
            statement = (
                statement.where(Farmer.id == inventory.farmer_id)
                if inventory.farmer_id
                else statement.where(false())
            )
        ids.update(db.scalars(statement))
    return len(ids - {None})


def species_totals(inventory: Inventory):
    totals = Counter()
    names = {}
    for row in inventory.plantings:
        totals[row.species_id] += planting_amount(row)
        names[row.species_id] = row.species.common_name
    return [
        DashboardSpeciesCount(species_id=key, species_common_name=names[key], trees=value)
        for key, value in sorted(totals.items(), key=lambda item: (-item[1], names[item[0]]))
    ]


def district_totals(inventory: Inventory):
    totals = Counter()
    for row in inventory.plantings:
        district = row_district(row)
        if district:
            totals[district] += planting_amount(row)
    return [
        DashboardDistrictCount(district=key, trees=value)
        for key, value in sorted(totals.items(), key=lambda item: (-item[1], item[0]))
    ]


def missing_coordinates(row) -> bool:
    return row.latitude is None or row.longitude is None


def agent_leaderboard(db: Session, inventory: Inventory, user: User) -> list[DashboardAgent]:
    """Field officers who registered trees in this view. Administrators only."""
    if user.role != "admin":
        return []
    grouped: dict[uuid.UUID, list] = defaultdict(list)
    for row in inventory.plantings:
        grouped[row.registered_by].append(row)
    if not grouped:
        return []
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(grouped))).all())
    board = []
    for agent_id, plantings in grouped.items():
        registered = sum(planting_amount(row) for row in plantings)
        checked = sum(
            planting_amount(row) for row in plantings if row.status not in {"planted", "unknown"}
        )
        located = sum(not missing_coordinates(row) for row in plantings)
        districts = sorted({name for row in plantings if (name := row_district(row))})
        board.append(
            DashboardAgent(
                id=agent_id,
                name=names.get(agent_id) or "Unnamed agent",
                trees_registered=registered,
                checked=checked,
                pending=registered - checked,
                coordinate_percent=round(100 * located / len(plantings)),
                last_registered_on=max(row.registered_at for row in plantings).date(),
                districts=districts,
            )
        )
    board.sort(key=lambda row: (-row.trees_registered, row.name.casefold()))
    return board


def _place_value(row, name: str) -> str | None:
    site = getattr(row, "site", None)
    for source in (site, row):
        if source is None:
            continue
        value = getattr(source, name, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _place_label(*parts: str | None) -> str | None:
    names = [part for part in parts if part]
    return " · ".join(names) or None


def _remember(counts: Counter, latest: dict[uuid.UUID, date], agent_id: uuid.UUID, when: date):
    counts[agent_id] += 1
    current = latest.get(agent_id)
    if current is None or when > current:
        latest[agent_id] = when


def _care_target(model, tree_ids: set[uuid.UUID] | None, batch_ids: set[uuid.UUID] | None):
    if tree_ids is None and batch_ids is None:
        return None
    clauses = []
    if tree_ids:
        clauses.append(model.tree_id.in_(tree_ids))
    if batch_ids:
        clauses.append(model.batch_id.in_(batch_ids))
    return or_(*clauses) if clauses else false()


def _care_activity(
    db: Session,
    agent_ids: set[uuid.UUID],
    *,
    tree_ids: set[uuid.UUID] | None = None,
    batch_ids: set[uuid.UUID] | None = None,
):
    counts: Counter = Counter()
    latest: dict[uuid.UUID, date] = {}
    if not agent_ids:
        return counts, latest
    statements = (
        select(LifecycleEvent.recorded_by, LifecycleEvent.event_date).where(
            LifecycleEvent.recorded_by.in_(agent_ids)
        ),
        select(GrowthMeasurement.registered_by, GrowthMeasurement.measured_on).where(
            GrowthMeasurement.registered_by.in_(agent_ids)
        ),
        select(MaintenanceActivity.registered_by, MaintenanceActivity.performed_on).where(
            MaintenanceActivity.registered_by.in_(agent_ids)
        ),
    )
    limited = (
        _care_target(LifecycleEvent, tree_ids, batch_ids),
        _care_target(GrowthMeasurement, tree_ids, batch_ids),
        _care_target(MaintenanceActivity, tree_ids, batch_ids),
    )
    statements = tuple(
        statement if limit is None else statement.where(limit)
        for statement, limit in zip(statements, limited, strict=True)
    )
    for statement in statements:
        for agent_id, day in db.execute(statement):
            _remember(counts, latest, agent_id, day)
    return counts, latest


def _duplicate_ids(rows: list) -> set[uuid.UUID]:
    """Extra records that repeat a species at the same point, or the same site and day."""
    groups: dict[tuple, list] = defaultdict(list)
    for row in rows:
        if isinstance(row, PlantingBatch):
            continue
        if row.latitude is not None and row.longitude is not None:
            key = ("gps", row.species_id, round(row.latitude, 4), round(row.longitude, 4))
        else:
            key = ("place", row.species_id, row.site_id, row.planting_date)
        groups[key].append(row)
    flagged: set[uuid.UUID] = set()
    for group in groups.values():
        if len(group) > 1:
            flagged.update(row.id for row in group[1:])
    return flagged


def collect_agent_board(
    db: Session,
    user: User,
    *,
    district: str | None = None,
    species_id: uuid.UUID | None = None,
) -> AgentBoardResponse:
    """Registration, places, follow-up, quality, and submissions for each field officer."""
    district = district.strip() if district and district.strip() else None
    all_inventory = read_inventory(db, user)
    inventory = filter_inventory(all_inventory, district, species_id)
    grouped: dict[uuid.UUID, list] = defaultdict(list)
    for row in inventory.plantings:
        grouped[row.registered_by].append(row)
    names = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(grouped))).all())
        if grouped
        else {}
    )
    narrowed = district is not None or species_id is not None
    care_counts, care_latest = _care_activity(
        db,
        set(grouped),
        tree_ids={row.id for row in inventory.trees} if narrowed else None,
        batch_ids={row.id for row in inventory.batches} if narrowed else None,
    )
    board: list[AgentBoardRow] = []
    for agent_id, plantings in grouped.items():
        registered = sum(planting_amount(row) for row in plantings)
        checked = sum(
            planting_amount(row) for row in plantings if row.status not in {"planted", "unknown"}
        )
        located = sum(not missing_coordinates(row) for row in plantings)
        days: Counter = Counter()
        places: Counter = Counter()
        issues: list[AgentIssue] = []
        duplicates = _duplicate_ids(plantings)
        incomplete = 0
        missing = 0
        for row in plantings:
            amount = planting_amount(row)
            registered_on = row.registered_at.date()
            days[registered_on] += amount
            district = _place_value(row, "district")
            sector = _place_value(row, "sector")
            village = _place_value(row, "village")
            if district:
                places[(district, sector, village)] += amount
            label = _place_label(district, sector, village)
            title = row.species.common_name
            kind = "batch" if isinstance(row, PlantingBatch) else "tree"
            shared = {
                "id": row.id,
                "kind": kind,
                "code": row.public_code,
                "title": title,
                "place": label,
            }
            if row.status in {"planted", "unknown"}:
                issues.append(AgentIssue(**shared, issue="condition"))
            if row.status == "stressed":
                issues.append(AgentIssue(**shared, issue="visit"))
            if missing_coordinates(row):
                missing += 1
                issues.append(AgentIssue(**shared, issue="coordinates"))
            if not district or not sector or not village:
                incomplete += 1
                issues.append(AgentIssue(**shared, issue="incomplete"))
            if row.id in duplicates:
                issues.append(AgentIssue(**shared, issue="duplicate"))
        last_registered_on = max(row.registered_at for row in plantings).date()
        last_submission_on = max(last_registered_on, care_latest.get(agent_id, last_registered_on))
        board.append(
            AgentBoardRow(
                id=agent_id,
                name=names.get(agent_id) or "Unnamed agent",
                trees_registered=registered,
                checked=checked,
                pending=registered - checked,
                coordinate_percent=round(100 * located / len(plantings)),
                last_registered_on=last_registered_on,
                last_submission_on=last_submission_on,
                submissions=len(plantings) + care_counts[agent_id],
                districts=sorted({name for row in plantings if (name := row_district(row))}),
                registrations=[
                    AgentRegistration(day=day, trees=trees) for day, trees in sorted(days.items())
                ],
                places=[
                    AgentPlaceCount(district=district, sector=sector, village=village, trees=trees)
                    for (district, sector, village), trees in sorted(
                        places.items(),
                        key=lambda item: (-item[1], item[0][0], item[0][1] or "", item[0][2] or ""),
                    )
                ],
                issues=issues,
                incomplete=incomplete,
                duplicates=len(duplicates),
                missing_coordinates=missing,
            )
        )
    board.sort(key=lambda row: (-row.trees_registered, row.name.casefold()))
    species_names = {row.species_id: row.species.common_name for row in all_inventory.plantings}
    return AgentBoardResponse(
        generated_at=utcnow(),
        districts=sorted({name for row in all_inventory.plantings if (name := row_district(row))}),
        species=[
            AgentSpeciesOption(id=key, common_name=name)
            for key, name in sorted(species_names.items(), key=lambda item: item[1].casefold())
        ],
        agents=board,
    )


def auxiliary_records(
    db: Session,
    model,
    user: User | None,
    farmer_id: uuid.UUID | None,
    district: str | None = None,
    species_id: uuid.UUID | None = None,
):
    statement = select(model)
    if user is not None and user.role == "field_officer":
        statement = statement.where(model.registered_by == user.id)
    elif user is not None and user.role == "farmer":
        sites = select(PlantingSite.id).where(PlantingSite.farmer_id == farmer_id).correlate(None)
        if farmer_id is None:
            statement = statement.where(false())
        elif model is SeedlingLot:
            statement = statement.where(model.nursery_site_id.in_(sites))
        else:
            site_column = model.destination_site_id if model is Distribution else model.site_id
            statement = statement.where(
                or_(
                    model.farmer_id == farmer_id,
                    and_(model.farmer_id.is_(None), site_column.in_(sites)),
                )
            )
    if district:
        site_column = (
            model.nursery_site_id
            if model is SeedlingLot
            else model.destination_site_id
            if model is Distribution
            else model.site_id
        )
        statement = statement.outerjoin(PlantingSite, site_column == PlantingSite.id)
        if model is Advisory:
            statement = statement.outerjoin(Farmer, Advisory.farmer_id == Farmer.id).where(
                or_(
                    PlantingSite.district.ilike(district),
                    and_(Advisory.site_id.is_(None), Farmer.district.ilike(district)),
                )
            )
        else:
            statement = statement.where(PlantingSite.district.ilike(district))
    if species_id is not None:
        if model is Distribution:
            statement = statement.join(
                SeedlingLot, Distribution.seedling_lot_id == SeedlingLot.id
            ).where(SeedlingLot.species_id == species_id)
        else:
            statement = statement.where(model.species_id == species_id)
    return list(db.scalars(statement))


@dataclass
class NurseryRecords:
    lots: list
    distributions: list
    advisories: list


def value_chain_for(
    inventory: Inventory, outcomes: Outcomes, nursery: NurseryRecords, start: date, end: date
) -> tuple[DashboardValueChain, bool]:
    lots, distributions, advisories = nursery.lots, nursery.distributions, nursery.advisories
    names = {row.id: row.species.common_name for row in inventory.plantings}
    amounts = defaultdict(lambda: {"kg": 0.0, "count": 0.0})
    for row in outcomes.harvests:
        if start <= row.harvested_on <= end:
            amounts[names[row.tree_id or row.batch_id]][row.unit] += row.quantity
    detail = DashboardValueChain(
        seedlings_remaining=sum(row.quantity_remaining for row in lots),
        seedlings_distributed=sum(
            row.quantity for row in distributions if start <= row.distributed_on <= end
        ),
        unsold_kg=sum(row.quantity_remaining for row in outcomes.harvests if row.unit == "kg"),
        advisories=sum(start <= row.issued_on <= end for row in advisories),
        harvest_by_species=[
            SpeciesTotal(
                species_common_name=name, harvested_kg=totals["kg"], harvested_count=totals["count"]
            )
            for name, totals in sorted(amounts.items())
        ],
    )
    return detail, any(
        row.data_origin == "synthetic_demo" for row in [*lots, *distributions, *advisories]
    )


def collect_dashboard(
    db: Session,
    user: User,
    *,
    district: str | None = None,
    species_id: uuid.UUID | None = None,
    range_name: str = "90",
    start_date: date | None = None,
    end_date: date | None = None,
) -> DashboardResponse:
    district = district.strip() if district and district.strip() else None
    # Reject explicit oversized ranges before any database or calendar work.
    if start_date is not None:
        resolve_period(range_name, start_date, end_date, utcnow().date())
    all_inventory = read_inventory(db, user)
    inventory = filter_inventory(all_inventory, district, species_id)
    outcomes = read_outcomes(db, inventory)
    viewer = user.role == "viewer"
    nursery = (
        NurseryRecords([], [], [])
        if viewer
        else NurseryRecords(
            auxiliary_records(db, SeedlingLot, user, inventory.farmer_id, district, species_id),
            auxiliary_records(db, Distribution, user, inventory.farmer_id, district, species_id),
            auxiliary_records(db, Advisory, user, inventory.farmer_id, district, species_id),
        )
    )
    earliest = min(
        [earliest_observation(inventory, outcomes)]
        + [row.produced_on for row in nursery.lots]
        + [row.distributed_on for row in nursery.distributions]
        + [row.issued_on for row in nursery.advisories]
    )
    start, end, monthly = resolve_period(range_name, start_date, end_date, earliest)
    checked, alive, survival = survival_figures(inventory, outcomes)
    healthy, moderate, critical = health_amounts(inventory)
    species = species_totals(inventory)
    districts = district_totals(inventory)
    records = [*inventory.sites, *inventory.plantings]
    includes_demo = any(
        row.data_origin == "synthetic_demo"
        for row in [
            *records,
            *outcomes.events,
            *outcomes.growth,
            *outcomes.maintenance,
            *outcomes.harvests,
            *outcomes.sales,
        ]
    )
    period_kg = sum(
        row.quantity
        for row in outcomes.harvests
        if row.unit == "kg" and start <= row.harvested_on <= end
    )
    period_sales = sum(row.amount_rwf for row in outcomes.sales if start <= row.sold_on <= end)
    series = series_for(inventory, outcomes, start, end, monthly, viewer)
    recent = [
        DashboardRecent(
            id=row.id,
            kind="batch" if isinstance(row, PlantingBatch) else "tree",
            title=row.species.common_name,
            site_name=None if viewer or row.site is None else row.site.name,
            status=row.status,
            planting_date=row.planting_date,
            quantity=row.quantity if isinstance(row, PlantingBatch) else 1,
            public_code=row.public_code,
        )
        for row in sorted(
            inventory.plantings, key=lambda row: (row.planting_date, str(row.id)), reverse=True
        )[:10]
    ]
    attention = []
    if not viewer:
        for row in records:
            kind = (
                "site"
                if isinstance(row, PlantingSite)
                else "tree"
                if isinstance(row, IndividualTree)
                else "batch"
            )
            title = row.name if kind == "site" else row.species.common_name
            place = row.district if kind == "site" else None if row.site is None else row.site.name
            for reason in (["stressed"] if row.status == "stressed" else []) + (
                ["missing_coordinates"] if missing_coordinates(row) else []
            ):
                attention.append(
                    DashboardAttention(
                        id=row.id,
                        kind=kind,
                        title=title,
                        reason=reason,
                        public_code=row.public_code,
                        status=row.status,
                        place=place,
                    )
                )
    options_species = {row.species_id: row.species.common_name for row in all_inventory.plantings}
    options_districts = {row.district for row in all_inventory.sites if row.district}
    options_districts.update(
        row.site.district
        for row in all_inventory.plantings
        if row.site is not None and row.site.district
    )
    scope_label = {
        "admin": "Programme overview",
        "field_officer": "Your field overview",
        "farmer": "Your household overview",
        "viewer": "Trees across Rwanda",
    }[user.role]
    query = urlencode(
        {
            key: value
            for key, value in {"district": district, "species_id": species_id}.items()
            if value is not None
        }
    )
    production, production_demo = (
        (None, False) if viewer else value_chain_for(inventory, outcomes, nursery, start, end)
    )
    return DashboardResponse(
        role=user.role,
        scope_label=scope_label,
        linked=user.role != "farmer" or inventory.farmer_id is not None,
        includes_demonstration=includes_demo or production_demo,
        generated_at=utcnow(),
        filters=DashboardFilters(
            district=district,
            species_id=species_id,
            range=range_name,
            start_date=start,
            end_date=end,
        ),
        options=DashboardOptions(
            districts=sorted(options_districts),
            species=[
                {"id": key, "common_name": value}
                for key, value in sorted(options_species.items(), key=lambda item: item[1])
            ],
        ),
        summary=DashboardSummary(
            recorded_trees=len(inventory.trees) + sum(row.quantity for row in inventory.batches),
            standing_trees=sum(standing_amount(row) for row in inventory.plantings),
            checked_trees=checked,
            surviving_trees=alive,
            survival_percent=survival,
            healthy_trees=healthy,
            moderate_trees=moderate,
            critical_trees=critical,
            farmers=0
            if viewer
            else farmer_count(db, inventory, user, bool(district or species_id)),
            sites=len(inventory.sites),
            species=len(species),
            districts=len(districts),
            harvested_kg=None if viewer else period_kg,
            sales_rwf=None if viewer else period_sales,
            records_missing_coordinates=sum(missing_coordinates(row) for row in records),
        ),
        series=series,
        species_counts=species,
        districts=districts,
        recent=recent,
        attention=attention[:20],
        agents=agent_leaderboard(db, inventory, user),
        map_query="/dashboard/map" + (f"?{query}" if query else ""),
        value_chain=production,
    )


def collect_analytics(
    db: Session,
    user: User | None = None,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> AnalyticsResponse:
    if user is not None and user.role == "viewer":
        raise DomainError("Reports are not available to viewer accounts.", status_code=403)
    bounded = start_date is not None or end_date is not None
    if bounded:
        # Legacy reports accept up to ten years of daily activity, never millions of days.
        start, end, _ = resolve_period("90", start_date, end_date, utcnow().date())
    else:
        start, end = date.min, utcnow().date()
    inventory = read_inventory(db, user)
    outcomes = read_outcomes(db, inventory)
    checked, alive, survival = survival_figures(inventory, outcomes)
    harvests = [row for row in outcomes.harvests if start <= row.harvested_on <= end]
    sales = [row for row in outcomes.sales if start <= row.sold_on <= end]
    species_names = {row.id: row.species.common_name for row in inventory.plantings}
    activity = defaultdict(Counter)
    for rows, field in (
        (outcomes.events, "event_date"),
        (outcomes.growth, "measured_on"),
        (outcomes.maintenance, "performed_on"),
    ):
        for row in rows:
            day = getattr(row, field)
            if start <= day <= end:
                activity[day][species_names.get(row.tree_id or row.batch_id, "Site work")] += 1
    if bounded:
        days = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
    else:
        days = sorted(activity)[-30:]

    lots, distributions, advisories = (
        auxiliary_records(db, SeedlingLot, user, inventory.farmer_id),
        auxiliary_records(db, Distribution, user, inventory.farmer_id),
        auxiliary_records(db, Advisory, user, inventory.farmer_id),
    )
    by_species = defaultdict(lambda: {"kg": 0.0, "count": 0.0})
    for row in harvests:
        by_species[species_names[row.tree_id or row.batch_id]][row.unit] += row.quantity
    visited = {
        row.site_id for row in [*outcomes.events, *outcomes.maintenance] if row.site_id is not None
    }
    planting_sites = {row.id: row.site_id for row in inventory.plantings}
    visited.update(
        planting_sites[row.tree_id or row.batch_id]
        for row in [*outcomes.events, *outcomes.growth, *outcomes.maintenance]
        if row.tree_id or row.batch_id
    )
    visited.update(
        row.site_id for row in inventory.plantings if row.status not in {"planted", "unknown"}
    )
    species = species_totals(inventory)
    district_sites = Counter(row.district for row in inventory.sites if row.district)
    return AnalyticsResponse(
        farmers=farmer_count(db, inventory, user, False),
        seedling_lots=len(lots),
        seedlings_remaining=sum(row.quantity_remaining for row in lots),
        seedlings_distributed=sum(row.quantity for row in distributions),
        growth_measurements=len(outcomes.growth),
        maintenance_activities=len(outcomes.maintenance),
        harvests=len(harvests),
        harvested_kg=sum(row.quantity for row in harvests if row.unit == "kg"),
        harvested_count=sum(row.quantity for row in harvests if row.unit == "count"),
        unsold_kg=sum(row.quantity_remaining for row in harvests if row.unit == "kg"),
        sales=len(sales),
        sales_rwf=sum(row.amount_rwf for row in sales),
        advisories=len(advisories),
        trees=len(inventory.trees),
        surviving_trees=alive,
        recorded_trees=len(inventory.trees) + sum(row.quantity for row in inventory.batches),
        checked_trees=checked,
        survival_percent=survival,
        sites=len(inventory.sites),
        sites_visited=len(visited),
        includes_demonstration=any(
            row.data_origin == "synthetic_demo"
            for row in [
                *inventory.sites,
                *inventory.plantings,
                *outcomes.events,
                *outcomes.growth,
                *outcomes.maintenance,
                *harvests,
                *sales,
                *lots,
                *distributions,
                *advisories,
            ]
        ),
        species_counts=[
            SpeciesCount(species_common_name=row.species_common_name, trees=row.trees)
            for row in species
        ],
        activity=[
            ActivityDay(
                day=day,
                checks=sum(activity[day].values()),
                by_species=[
                    ActivitySlice(species_common_name=name, checks=count)
                    for name, count in sorted(activity[day].items())
                ],
            )
            for day in days
        ],
        by_species=[
            SpeciesTotal(
                species_common_name=name,
                harvested_kg=amounts["kg"],
                harvested_count=amounts["count"],
            )
            for name, amounts in sorted(by_species.items())
        ],
        by_district=[
            DistrictTotal(district=name, sites=count)
            for name, count in sorted(district_sites.items())
        ],
    )
