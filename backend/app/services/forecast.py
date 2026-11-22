"""Expected next harvest from standing trees.

Recorded harvests and sales are not included in these totals. A published
species reference is used when a tree is old enough and has no harvest history.
Earlier harvests on the same farm replace that reference for trees of the same
species once they are old enough to bear.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.entities import (
    Farmer,
    Harvest,
    IndividualTree,
    PlantingBatch,
    PlantingSite,
    SpeciesYieldReference,
    User,
)
from app.schemas.valuechain import (
    ForecastAgent,
    ForecastFarmer,
    ForecastGroup,
    ForecastPlanting,
    ForecastSpecies,
    ForecastTotal,
    HarvestForecast,
)
from app.services.common import utcnow
from app.services.dashboard import Inventory, filter_inventory, read_inventory, row_district

Basis = str


def _age(planting_date: date, today: date) -> float:
    return (today - planting_date).days / 365.25


def _farmer_id(row) -> uuid.UUID | None:
    if row.farmer_id is not None:
        return row.farmer_id
    if row.site is not None and row.site.farmer_id is not None:
        return row.site.farmer_id
    return None


def _province(row) -> str | None:
    if getattr(row, "province", None):
        return row.province
    if row.site is not None and row.site.province:
        return row.site.province
    return None


def _count(row) -> int:
    return row.quantity if isinstance(row, PlantingBatch) else 1


def _standing(row) -> int:
    if row.status in {"dead", "removed"}:
        return 0
    return _count(row)


def _expectation(rows: list[Harvest]) -> tuple[float, float, float, str, int] | None:
    if not rows:
        return None
    latest = max(rows, key=lambda row: (row.harvested_on, row.created_at))
    same = [row.quantity for row in rows if row.unit == latest.unit]
    return sum(same) / len(same), min(same), max(same), latest.unit, len(same)


def _round(value: float) -> float:
    return round(value, 2)


def _sector(row) -> str | None:
    if getattr(row, "sector", None):
        return row.sector
    if row.site is not None and row.site.sector:
        return row.site.sector
    return None


def _household_inventory(db: Session, farmer_id: uuid.UUID) -> Inventory:
    sites = list(db.scalars(select(PlantingSite).where(PlantingSite.farmer_id == farmer_id)))
    site_ids = [site.id for site in sites]
    planted = []
    for model in (IndividualTree, PlantingBatch):
        scope = model.farmer_id == farmer_id
        if site_ids:
            scope = or_(scope, and_(model.farmer_id.is_(None), model.site_id.in_(site_ids)))
        planted.append(
            list(
                db.scalars(
                    select(model)
                    .where(scope)
                    .options(joinedload(model.site), joinedload(model.species))
                )
            )
        )
    return Inventory(sites, planted[0], planted[1], farmer_id)


def _estimates(
    db: Session,
    user: User,
    *,
    district: str | None = None,
    species_id: uuid.UUID | None = None,
    inventory: Inventory | None = None,
) -> list[dict]:
    district = district.strip() if district and district.strip() else None
    inventory = filter_inventory(inventory or read_inventory(db, user), district, species_id)
    today = utcnow().date()
    references = {row.scientific_name: row for row in db.scalars(select(SpeciesYieldReference))}
    tree_ids = [row.id for row in inventory.trees]
    batch_ids = [row.id for row in inventory.batches]
    harvest_rows: list[Harvest] = []
    if tree_ids or batch_ids:
        conditions = []
        if tree_ids:
            conditions.append(Harvest.tree_id.in_(tree_ids))
        if batch_ids:
            conditions.append(Harvest.batch_id.in_(batch_ids))
        harvest_rows = list(db.scalars(select(Harvest).where(or_(*conditions))))
    by_target: dict[uuid.UUID, list[Harvest]] = defaultdict(list)
    for row in harvest_rows:
        by_target[row.tree_id or row.batch_id].append(row)

    farmer_ids = {farmer_id for row in inventory.plantings if (farmer_id := _farmer_id(row))}
    names = {}
    if farmer_ids:
        names = {
            row.id: row.display_name
            for row in db.scalars(select(Farmer).where(Farmer.id.in_(farmer_ids)))
        }

    pools: dict[tuple, list[float]] = defaultdict(lambda: [0.0, 0.0])
    own: dict[uuid.UUID, tuple[float, str, int]] = {}
    spans: dict[uuid.UUID, tuple[float, float]] = {}
    ages: dict[uuid.UUID, float] = {}
    for row in inventory.plantings:
        ages[row.id] = _age(row.planting_date, today)
        expected = _expectation(by_target.get(row.id, []))
        if expected is None:
            continue
        average, low, high, unit, harvest_count = expected
        own[row.id] = (average, unit, harvest_count)
        spans[row.id] = (low, high)
        farmer_id = _farmer_id(row)
        trees = _count(row)
        if farmer_id is None or trees < 1:
            continue
        qty = average
        bucket = pools[(farmer_id, row.species_id, unit)]
        bucket[0] += qty
        bucket[1] += trees

    youngest: dict[tuple, float] = {}
    for row in inventory.plantings:
        if row.id not in own:
            continue
        farmer_id = _farmer_id(row)
        if farmer_id is None:
            continue
        key = (farmer_id, row.species_id)
        age = ages[row.id]
        if key not in youngest or age < youngest[key]:
            youngest[key] = age

    estimates = []
    for row in inventory.plantings:
        trees = _standing(row)
        if trees < 1:
            continue
        reference = references.get(row.species.scientific_name)
        harvested = row.id in own
        if reference is None and row.species.harvest_potential is not True and not harvested:
            continue
        age = ages[row.id]
        farmer_id = _farmer_id(row)
        low = high = None
        unit = None
        basis: Basis = "none"
        note = "No yield reference yet."
        source = None
        if harvested:
            _average, unit, harvest_count = own[row.id]
            recorded_low, recorded_high = spans[row.id]
            scale = trees / _count(row)
            low = recorded_low * scale
            high = recorded_high * scale
            basis = "recorded"
            if recorded_low != recorded_high:
                note = f"Range of {harvest_count} recorded harvests."
            elif harvest_count == 1:
                note = "Average of 1 recorded harvest."
            else:
                note = f"Average of {harvest_count} recorded harvests."
        else:
            floor = reference.years_to_bearing if reference is not None else None
            if floor is None and farmer_id is not None:
                floor = youngest.get((farmer_id, row.species_id))
            pool = None
            if farmer_id is not None and floor is not None and age >= floor:
                choices = [
                    (key[2], totals)
                    for key, totals in pools.items()
                    if key[0] == farmer_id and key[1] == row.species_id and totals[1] > 0
                ]
                if choices:
                    unit, totals = max(choices, key=lambda item: item[1][1])
                    per_tree = totals[0] / totals[1]
                    low = high = per_tree * trees
                    pool = True
                    basis = "household"
                    note = "Average from earlier harvests of this species on this farm."
            if pool is None and reference is not None and age >= reference.years_to_cited_yield:
                low = reference.quantity_low * trees
                high = reference.quantity_high * trees
                unit = reference.unit
                basis = "reference"
                source = reference.source
                note = "Published reference for a productive tree."
            elif pool is None and reference is not None and age >= reference.years_to_bearing:
                basis = "bearing"
                source = reference.source
                note = (
                    "Old enough to bear. The published quantity applies from year "
                    f"{reference.years_to_cited_yield}."
                )
            elif pool is None and floor is not None and age < floor:
                basis = "young"
                note = "Not yet productive."
            elif pool is None and reference is None:
                basis = "none"
                note = "No yield reference yet."

        estimates.append(
            {
                "public_code": row.public_code,
                "species": row.species.common_name,
                "trees": trees,
                "low": None if low is None else _round(low),
                "high": None if high is None else _round(high),
                "unit": unit,
                "basis": basis,
                "note": note,
                "source": source,
                "kind": "batch" if isinstance(row, PlantingBatch) else "tree",
                "district": row_district(row),
                "province": _province(row),
                "sector": _sector(row),
                "site_name": row.site.name if row.site is not None else None,
                "farmer_id": farmer_id,
                "species_id": row.species_id,
                "months": sorted({item.harvested_on.month for item in by_target.get(row.id, [])}),
                "farmer": names.get(farmer_id) if farmer_id is not None else None,
            }
        )

    return estimates


def _farmer_forecasts(
    db: Session,
    user: User,
    *,
    district: str | None,
    species_id: uuid.UUID | None,
    registrar_id: uuid.UUID | None,
) -> list[ForecastFarmer]:
    statement = select(Farmer).order_by(Farmer.display_name)
    if registrar_id is not None:
        statement = statement.where(Farmer.registered_by == registrar_id)
    assigned = list(db.scalars(statement))
    agent_ids = {farmer.registered_by for farmer in assigned}
    agent_names = {}
    if agent_ids:
        agent_names = {
            row.id: row.full_name for row in db.scalars(select(User).where(User.id.in_(agent_ids)))
        }
    farmers = []
    for farmer in assigned:
        rows = _estimates(
            db,
            user,
            district=district,
            species_id=species_id,
            inventory=_household_inventory(db, farmer.id),
        )
        detail = _assemble("farmer", rows)
        farmers.append(
            ForecastFarmer(
                farmer_id=farmer.id,
                display_name=farmer.display_name,
                province=farmer.province,
                district=farmer.district,
                registered_trees=sum(row["trees"] for row in rows),
                totals=detail.totals,
                by_species=detail.by_species,
                plantings=detail.plantings,
                young_trees=detail.young_trees,
                bearing_trees=detail.bearing_trees,
                unestimated_trees=detail.unestimated_trees,
                agent_id=farmer.registered_by,
                agent_name=agent_names.get(farmer.registered_by),
            )
        )

    def weight(item: ForecastFarmer) -> float:
        for total in item.totals:
            if total.unit == "kg":
                return total.low
        return item.totals[0].low if item.totals else -1

    farmers.sort(key=lambda item: (-weight(item), item.display_name))
    return farmers


def _agent_roster(db: Session, farmers: list[ForecastFarmer]) -> list[ForecastAgent]:
    counts: dict[uuid.UUID, int] = defaultdict(int)
    names = {}
    for farmer in farmers:
        if farmer.agent_id is None:
            continue
        counts[farmer.agent_id] += 1
        if farmer.agent_name:
            names[farmer.agent_id] = farmer.agent_name
    roster = []
    seen = set()
    officers = db.scalars(select(User).where(User.role == "field_officer").order_by(User.full_name))
    for officer in officers:
        seen.add(officer.id)
        roster.append(
            ForecastAgent(
                agent_id=officer.id,
                display_name=officer.full_name,
                farmer_count=counts[officer.id],
            )
        )
    for agent_id, count in counts.items():
        if agent_id in seen:
            continue
        roster.append(
            ForecastAgent(
                agent_id=agent_id,
                display_name=names.get(agent_id, ""),
                farmer_count=count,
            )
        )
    roster = [item for item in roster if item.farmer_count > 0]
    roster.sort(key=lambda item: (-item.farmer_count, item.display_name))
    return roster


def collect_forecast(
    db: Session,
    user: User,
    *,
    district: str | None = None,
    species_id: uuid.UUID | None = None,
) -> HarvestForecast:
    farmers = []
    agents: list[ForecastAgent] = []
    if user.role in {"field_officer", "admin"}:
        farmers = _farmer_forecasts(
            db,
            user,
            district=district,
            species_id=species_id,
            registrar_id=user.id if user.role == "field_officer" else None,
        )
    if user.role == "admin":
        agents = _agent_roster(db, farmers)
    return _assemble(
        user.role,
        _estimates(db, user, district=district, species_id=species_id),
        farmers,
        agents,
    )


def _assemble(
    role: str,
    estimates: list[dict],
    assigned: list[ForecastFarmer] | None = None,
    agents: list[ForecastAgent] | None = None,
) -> HarvestForecast:
    totals: dict[str, list] = defaultdict(lambda: [0.0, 0.0, 0])
    species: dict[tuple, list] = defaultdict(lambda: [0.0, 0.0, 0, None])
    places: dict[tuple, list] = defaultdict(lambda: [0.0, 0.0, 0])
    sectors: dict[tuple, list] = defaultdict(lambda: [0.0, 0.0, 0])
    farmers: dict[tuple, list] = defaultdict(lambda: [0.0, 0.0, 0])
    provinces: dict[tuple, list] = defaultdict(lambda: [0.0, 0.0, 0])
    young = bearing = unestimated = 0
    plantings = []
    for row in estimates:
        if row["basis"] == "young":
            young += row["trees"]
        elif row["basis"] == "bearing":
            bearing += row["trees"]
        elif row["basis"] == "none":
            unestimated += row["trees"]
        if row["unit"] is not None and row["low"] is not None:
            bucket = totals[row["unit"]]
            bucket[0] += row["low"]
            bucket[1] += row["high"]
            bucket[2] += row["trees"]
            species_bucket = species[(row["species"], row["unit"])]
            species_bucket[0] += row["low"]
            species_bucket[1] += row["high"]
            species_bucket[2] += row["trees"]
            if row["source"]:
                species_bucket[3] = row["source"]
            if row["district"]:
                place = places[(row["district"], row["unit"])]
                place[0] += row["low"]
                place[1] += row["high"]
                place[2] += row["trees"]
            if row["province"]:
                province = provinces[(row["province"], row["unit"])]
                province[0] += row["low"]
                province[1] += row["high"]
                province[2] += row["trees"]
            if row["sector"]:
                sector = sectors[(row["sector"], row["unit"])]
                sector[0] += row["low"]
                sector[1] += row["high"]
                sector[2] += row["trees"]
            if role != "viewer" and row["farmer"]:
                farmer = farmers[(row["farmer"], row["unit"])]
                farmer[0] += row["low"]
                farmer[1] += row["high"]
                farmer[2] += row["trees"]
        if role in {"farmer", "admin"}:
            plantings.append(
                ForecastPlanting(
                    public_code=row["public_code"],
                    species_common_name=row["species"],
                    trees=row["trees"],
                    unit=row["unit"],
                    low=row["low"],
                    high=row["high"],
                    basis=row["basis"],
                    note=row["note"],
                    months=row["months"],
                    kind=row["kind"],
                    province=row["province"],
                    district=row["district"],
                    sector=row["sector"],
                    farmer_id=row["farmer_id"],
                )
            )

    def grouped(rows: dict[tuple, list]) -> list[ForecastGroup]:
        return [
            ForecastGroup(
                label=key[0],
                unit=key[1],
                low=_round(value[0]),
                high=_round(value[1]),
                trees=value[2],
            )
            for key, value in sorted(rows.items(), key=lambda item: (-item[1][0], item[0][0]))
        ]

    plantings.sort(key=lambda row: (row.species_common_name, row.public_code))
    return HarvestForecast(
        role=role,
        totals=[
            ForecastTotal(unit=unit, low=_round(value[0]), high=_round(value[1]), trees=value[2])
            for unit, value in sorted(totals.items())
        ],
        by_species=[
            ForecastSpecies(
                species_common_name=key[0],
                unit=key[1],
                low=_round(value[0]),
                high=_round(value[1]),
                trees=value[2],
                source=value[3],
            )
            for key, value in sorted(species.items(), key=lambda item: item[0][0])
        ],
        by_district=grouped(places),
        by_province=grouped(provinces),
        by_sector=grouped(sectors),
        by_farmer=grouped(farmers),
        plantings=plantings,
        young_trees=young,
        bearing_trees=bearing,
        unestimated_trees=unestimated,
        registered_trees=sum(row["trees"] for row in estimates),
        farmers=assigned or [],
        agents=agents or [],
    )
