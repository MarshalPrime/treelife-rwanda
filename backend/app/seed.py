"""Load clearly labelled synthetic demonstration records.

Refuses to run when APP_ENV=production. These rows are not field observations.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.data.species_catalogue import apply_species_catalogue
from app.db.session import SessionLocal
from app.models.entities import (
    Advisory,
    CarbonAuthorization,
    CarbonAuthorizationEvent,
    CarbonMeasurement,
    DataOrigin,
    Distribution,
    Farmer,
    GrowthMeasurement,
    Harvest,
    IndividualTree,
    LifecycleEvent,
    MaintenanceActivity,
    Organization,
    PlantingBatch,
    PlantingSite,
    Sale,
    SeedlingLot,
    Species,
    User,
)
from app.services.carbon import store_carbon_estimate
from app.services.common import allocate_code, apply_point, utcnow, write_audit

SYNTHETIC_NOTE = "SYNTHETIC DEMONSTRATION RECORD. Not a verified field observation."

SPECIES = [
    ("Persea americana", "Avocado", "fruit"),
    ("Mangifera indica", "Mango", "fruit"),
    ("Carica papaya", "Papaya", "fruit"),
    ("Citrus sinensis", "Sweet orange", "fruit"),
    ("Grevillea robusta", "Grevillea", "agroforestry"),
    ("Jacaranda mimosifolia", "Jacaranda", "urban"),
    ("Markhamia lutea", "Markhamia", "agroforestry"),
    ("Calliandra calothyrsus", "Calliandra", "agroforestry"),
]


def _get_or_create_user(db, email: str, full_name: str, role: str, password: str) -> User:
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        if email.endswith("@demo.treelife.local") and not email.startswith("synthetic-agent-"):
            existing.password_hash = hash_password(password)
        return existing
    user = User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _species_by_name(db) -> dict[str, Species]:
    found = {}
    for scientific_name, common_name, category in SPECIES:
        species = db.scalar(select(Species).where(Species.scientific_name == scientific_name))
        if species is None:
            species = Species(
                scientific_name=scientific_name,
                common_name=common_name,
                category=category,
            )
            db.add(species)
            db.flush()
        found[scientific_name] = species
    return found


def _organization(db, name: str, org_type: str) -> Organization:
    existing = db.scalar(select(Organization).where(Organization.name == name))
    if existing is not None:
        return existing
    org = Organization(name=name, org_type=org_type, notes=SYNTHETIC_NOTE)
    db.add(org)
    db.flush()
    return org


def _site(
    db, officer: User, organization: Organization | None, request_id: str, **fields
) -> PlantingSite:
    existing = db.scalar(select(PlantingSite).where(PlantingSite.client_request_id == request_id))
    if existing is not None:
        return existing
    latitude = fields.pop("latitude", None)
    longitude = fields.pop("longitude", None)
    site = PlantingSite(
        public_code=allocate_code(db, PlantingSite, "SITE"),
        organization_id=organization.id if organization else None,
        status="active",
        data_origin=DataOrigin.synthetic_demo.value,
        client_request_id=request_id,
        registered_by=officer.id,
        registered_at=utcnow(),
        notes=SYNTHETIC_NOTE,
        **fields,
    )
    apply_point(site, latitude, longitude)
    db.add(site)
    db.flush()
    write_audit(db, officer, "create", "planting_site", site.id, ["name", "coordinates"])
    return site


def _tree(
    db, officer: User, site: PlantingSite, species: Species, request_id: str, **fields
) -> IndividualTree:
    existing = db.scalar(
        select(IndividualTree).where(IndividualTree.client_request_id == request_id)
    )
    if existing is not None:
        return existing
    latitude = fields.pop("latitude", None)
    longitude = fields.pop("longitude", None)
    registered_at = fields.pop("registered_at", None) or utcnow()
    tree = IndividualTree(
        public_code=allocate_code(db, IndividualTree, "TREE"),
        site_id=site.id,
        species_id=species.id,
        data_origin=DataOrigin.synthetic_demo.value,
        client_request_id=request_id,
        registered_by=officer.id,
        registered_at=registered_at,
        notes=SYNTHETIC_NOTE,
        status=fields.pop("status", "planted"),
        **fields,
    )
    apply_point(tree, latitude, longitude)
    db.add(tree)
    db.flush()
    write_audit(db, officer, "create", "individual_tree", tree.id, ["species_id", "coordinates"])
    return tree


def _batch(
    db, officer: User, site: PlantingSite, species: Species, request_id: str, **fields
) -> PlantingBatch:
    existing = db.scalar(select(PlantingBatch).where(PlantingBatch.client_request_id == request_id))
    if existing is not None:
        return existing
    latitude = fields.pop("latitude", None)
    longitude = fields.pop("longitude", None)
    batch = PlantingBatch(
        public_code=allocate_code(db, PlantingBatch, "BATCH"),
        site_id=site.id,
        species_id=species.id,
        data_origin=DataOrigin.synthetic_demo.value,
        client_request_id=request_id,
        registered_by=officer.id,
        registered_at=utcnow(),
        notes=SYNTHETIC_NOTE,
        status=fields.pop("status", "planted"),
        **fields,
    )
    apply_point(batch, latitude, longitude)
    db.add(batch)
    db.flush()
    write_audit(db, officer, "create", "planting_batch", batch.id, ["quantity", "coordinates"])
    return batch


def _event(db, officer: User, request_id: str, **fields) -> None:
    existing = db.scalar(
        select(LifecycleEvent).where(LifecycleEvent.client_request_id == request_id)
    )
    if existing is not None:
        return
    event = LifecycleEvent(
        public_code=allocate_code(db, LifecycleEvent, "EVT"),
        data_origin=DataOrigin.synthetic_demo.value,
        client_request_id=request_id,
        recorded_by=officer.id,
        notes=SYNTHETIC_NOTE,
        **fields,
    )
    db.add(event)
    db.flush()


def _by_request(db, model, request_id: str):
    return db.scalar(select(model).where(model.client_request_id == request_id))


def _value_chain(
    db,
    officer: User,
    cooperative: Organization,
    species: dict[str, Species],
    orchard: PlantingSite,
    avocado: IndividualTree,
    mango_batch: PlantingBatch,
    smallholder: User,
) -> None:
    """Attach one synthetic nursery-to-sale chain. A second run does not duplicate it."""
    farmer = _by_request(db, Farmer, "synthetic-demo-farmer-01")
    if farmer is None:
        farmer = Farmer(
            public_code=allocate_code(db, Farmer, "FARM"),
            display_name="Farmer",
            organization_id=cooperative.id,
            district="Bugesera",
            notes=SYNTHETIC_NOTE,
            data_origin=DataOrigin.synthetic_demo.value,
            client_request_id="synthetic-demo-farmer-01",
            registered_by=officer.id,
            registered_at=utcnow(),
        )
        db.add(farmer)
        db.flush()
    farmer.display_name = "Farmer"
    if orchard.farmer_id is None:
        orchard.farmer_id = farmer.id
    if farmer.user_id is None:
        farmer.user_id = smallholder.id
    nursery = _site(
        db,
        officer,
        cooperative,
        "synthetic-demo-site-nursery-01",
        name="SYNTHETIC Nursery holding — demo D",
        site_type="nursery_holding",
        province="Eastern Province",
        district="Bugesera",
        sector="Demo sector",
        latitude=-1.965000,
        longitude=30.090000,
    )
    lot = _by_request(db, SeedlingLot, "synthetic-demo-lot-01")
    if lot is None:
        lot = SeedlingLot(
            public_code=allocate_code(db, SeedlingLot, "LOT"),
            nursery_site_id=nursery.id,
            species_id=species["Mangifera indica"].id,
            quantity_produced=80,
            quantity_remaining=80,
            produced_on=date(2026, 1, 10),
            notes=SYNTHETIC_NOTE,
            data_origin=DataOrigin.synthetic_demo.value,
            client_request_id="synthetic-demo-lot-01",
            registered_by=officer.id,
        )
        db.add(lot)
        db.flush()
    if _by_request(db, Distribution, "synthetic-demo-dist-01") is None:
        db.add(
            Distribution(
                public_code=allocate_code(db, Distribution, "DIST"),
                seedling_lot_id=lot.id,
                destination_site_id=orchard.id,
                farmer_id=farmer.id,
                quantity=20,
                distributed_on=date(2026, 2, 1),
                notes=SYNTHETIC_NOTE,
                data_origin=DataOrigin.synthetic_demo.value,
                client_request_id="synthetic-demo-dist-01",
                registered_by=officer.id,
            )
        )
        lot.quantity_remaining = lot.quantity_produced - 20
        db.flush()
    if _by_request(db, GrowthMeasurement, "synthetic-demo-growth-01") is None:
        db.add(
            GrowthMeasurement(
                public_code=allocate_code(db, GrowthMeasurement, "GROW"),
                tree_id=avocado.id,
                measured_on=date(2026, 9, 15),
                height_m=1.8,
                notes=SYNTHETIC_NOTE,
                data_origin=DataOrigin.synthetic_demo.value,
                client_request_id="synthetic-demo-growth-01",
                registered_by=officer.id,
            )
        )
    if _by_request(db, MaintenanceActivity, "synthetic-demo-work-01") is None:
        db.add(
            MaintenanceActivity(
                public_code=allocate_code(db, MaintenanceActivity, "WORK"),
                batch_id=mango_batch.id,
                activity_type="mulching",
                performed_on=date(2026, 6, 4),
                notes=SYNTHETIC_NOTE,
                data_origin=DataOrigin.synthetic_demo.value,
                client_request_id="synthetic-demo-work-01",
                registered_by=officer.id,
            )
        )
    harvest = _by_request(db, Harvest, "synthetic-demo-harvest-01")
    if harvest is None:
        harvest = Harvest(
            public_code=allocate_code(db, Harvest, "HARV"),
            batch_id=mango_batch.id,
            harvested_on=date(2026, 10, 1),
            quantity=12,
            quantity_remaining=12,
            unit="kg",
            notes=SYNTHETIC_NOTE,
            data_origin=DataOrigin.synthetic_demo.value,
            client_request_id="synthetic-demo-harvest-01",
            registered_by=officer.id,
        )
        db.add(harvest)
        db.flush()
    if _by_request(db, Sale, "synthetic-demo-sale-01") is None:
        db.add(
            Sale(
                public_code=allocate_code(db, Sale, "SALE"),
                harvest_id=harvest.id,
                sold_on=date(2026, 10, 2),
                quantity=5,
                unit="kg",
                amount_rwf=4000,
                buyer_name="SYNTHETIC Demo Market",
                notes=SYNTHETIC_NOTE,
                data_origin=DataOrigin.synthetic_demo.value,
                client_request_id="synthetic-demo-sale-01",
                registered_by=officer.id,
            )
        )
        harvest.quantity_remaining = 7
        db.flush()
    if _by_request(db, Advisory, "synthetic-demo-advice-01") is None:
        db.add(
            Advisory(
                public_code=allocate_code(db, Advisory, "ADV"),
                title="SYNTHETIC mulch after harvest",
                body="Keep the soil covered and water during a dry week. This note is a demonstration, not agronomic advice from a field visit.",
                species_id=species["Mangifera indica"].id,
                farmer_id=farmer.id,
                site_id=orchard.id,
                issued_on=date(2026, 10, 3),
                data_origin=DataOrigin.synthetic_demo.value,
                client_request_id="synthetic-demo-advice-01",
                registered_by=officer.id,
            )
        )
    db.flush()


def _sample_health_trees(
    db, officer: User, organization: Organization, species: dict[str, Species]
) -> None:
    """Place labelled demonstration trees so each health colour appears on the map.

    Coordinates are district-centre offsets for the demonstration. They are not surveyed plots.
    """

    groves = [
        (
            "synthetic-demo-site-huye-01",
            "SYNTHETIC Hill planting — demo Huye",
            "Southern Province",
            "Huye",
            -2.596,
            29.739,
        ),
        (
            "synthetic-demo-site-musanze-01",
            "SYNTHETIC Slope planting — demo Musanze",
            "Northern Province",
            "Musanze",
            -1.503,
            29.634,
        ),
        (
            "synthetic-demo-site-rwamagana-01",
            "SYNTHETIC Roadside planting — demo Rwamagana",
            "Eastern Province",
            "Rwamagana",
            -1.949,
            30.435,
        ),
        (
            "synthetic-demo-site-rubavu-01",
            "SYNTHETIC Lakeside planting — demo Rubavu",
            "Western Province",
            "Rubavu",
            -1.687,
            29.256,
        ),
        (
            "synthetic-demo-site-nyagatare-01",
            "SYNTHETIC Open planting — demo Nyagatare",
            "Eastern Province",
            "Nyagatare",
            -1.299,
            30.327,
        ),
    ]
    sites = [
        _site(
            db,
            officer,
            organization,
            request_id,
            name=name,
            site_type="orchard",
            province=province,
            district=district,
            sector="Demo sector",
            latitude=latitude,
            longitude=longitude,
        )
        for request_id, name, province, district, latitude, longitude in groves
    ]
    # Offsets are a few kilometres so each health colour stays visible at country scale.
    # They stay inside the district and inside Rwanda. They are not surveyed plots.
    samples = [
        (0, "Mangifera indica", "surviving", date(2024, 11, 4), 0.07, 0.05),
        (0, "Persea americana", "stressed", date(2025, 2, 18), -0.06, 0.08),
        (0, "Carica papaya", "dead", date(2025, 6, 9), 0.05, -0.07),
        (0, "Citrus sinensis", "planted", date(2026, 3, 12), -0.08, -0.05),
        (1, "Grevillea robusta", "surviving", date(2023, 9, 2), 0.06, 0.07),
        (1, "Markhamia lutea", "unknown", date(2026, 1, 20), -0.07, 0.05),
        (1, "Jacaranda mimosifolia", "stressed", date(2025, 8, 7), 0.08, -0.06),
        (1, "Calliandra calothyrsus", "dead", date(2024, 4, 15), -0.05, -0.08),
        (2, "Citrus sinensis", "surviving", date(2024, 7, 11), 0.07, -0.06),
        (2, "Mangifera indica", "stressed", date(2025, 5, 3), -0.08, 0.05),
        (2, "Persea americana", "dead", date(2025, 10, 1), 0.05, 0.08),
        (2, "Carica papaya", "planted", date(2026, 4, 8), -0.06, -0.07),
        (3, "Jacaranda mimosifolia", "surviving", date(2024, 1, 16), 0.08, 0.05),
        (3, "Grevillea robusta", "stressed", date(2025, 9, 19), -0.05, -0.07),
        (3, "Markhamia lutea", "dead", date(2023, 12, 5), 0.06, -0.08),
        (3, "Calliandra calothyrsus", "unknown", date(2026, 2, 2), -0.07, 0.06),
        (4, "Persea americana", "surviving", date(2024, 8, 22), 0.05, 0.08),
        (4, "Mangifera indica", "planted", date(2026, 5, 6), -0.08, 0.06),
        (4, "Citrus sinensis", "stressed", date(2025, 3, 14), 0.07, -0.05),
        (4, "Carica papaya", "dead", date(2024, 6, 28), -0.06, -0.07),
    ]
    for index, (grove, scientific_name, status, planted, dlat, dlon) in enumerate(samples):
        chosen = species[scientific_name]
        site = sites[grove]
        _, _, _, _, base_lat, base_lon = groves[grove]
        category = (
            chosen.category
            if chosen.category in {"urban", "fruit", "agroforestry", "other"}
            else "other"
        )
        tree = _tree(
            db,
            officer,
            site,
            chosen,
            f"synthetic-demo-health-{index:02d}",
            category=category,
            planting_date=planted,
            latitude=base_lat + dlat,
            longitude=base_lon + dlon,
            status=status,
        )
        apply_point(tree, base_lat + dlat, base_lon + dlon)


def _sample_forests(db, officer: User, species: dict[str, Species]) -> None:
    """Demonstration stands. The outlines are district-scale sketches, not surveyed forests."""

    from app.schemas.forests import ForestCreate, ForestPoint
    from app.services.forests import create_forest

    stands = [
        (
            "synthetic-demo-forest-huye-01",
            "SYNTHETIC Hill stand — demo Huye",
            "Grevillea robusta",
            2400,
            "mixed",
            "surviving",
            "Southern Province",
            "Huye",
            [
                (29.55, -2.78),
                (29.62, -2.77),
                (29.63, -2.72),
                (29.56, -2.71),
            ],
        ),
        (
            "synthetic-demo-forest-musanze-01",
            "SYNTHETIC Slope stand — demo Musanze",
            "Markhamia lutea",
            1800,
            "rows",
            "stressed",
            "Northern Province",
            "Musanze",
            [
                (29.42, -1.58),
                (29.50, -1.57),
                (29.51, -1.51),
                (29.43, -1.52),
            ],
        ),
        (
            "synthetic-demo-forest-nyagatare-01",
            "SYNTHETIC Open stand — demo Nyagatare",
            "Calliandra calothyrsus",
            900,
            "natural",
            "unknown",
            "Eastern Province",
            "Nyagatare",
            [
                (30.45, -1.24),
                (30.53, -1.23),
                (30.54, -1.17),
                (30.46, -1.18),
            ],
        ),
    ]
    for (
        request_id,
        name,
        scientific_name,
        trees,
        distribution,
        status,
        province,
        district,
        ring,
    ) in stands:
        create_forest(
            db,
            officer,
            ForestCreate(
                name=name,
                species_id=species[scientific_name].id,
                estimated_trees=trees,
                distribution=distribution,
                status=status,
                description=SYNTHETIC_NOTE,
                province=province,
                district=district,
                boundary=[ForestPoint(longitude=lon, latitude=lat) for lon, lat in ring],
                client_request_id=request_id,
            ),
            origin="synthetic_demo",
            commit=False,
        )


def _sample_agents(
    db, officer: User, organization: Organization, species: dict[str, Species], password: str
) -> None:
    """Fifty labelled field officers so the overview list can be shown before real staff join.

    Names are numbered examples. Coordinates are district-centre offsets, not surveyed plots.
    """

    districts = [
        ("Kigali City", "Nyarugenge", -1.950, 30.060),
        ("Eastern Province", "Bugesera", -2.050, 30.120),
        ("Southern Province", "Huye", -2.596, 29.739),
        ("Northern Province", "Musanze", -1.503, 29.634),
        ("Eastern Province", "Rwamagana", -1.949, 30.435),
        ("Western Province", "Rubavu", -1.687, 29.256),
        ("Eastern Province", "Nyagatare", -1.299, 30.327),
    ]
    sites = {
        district: _site(
            db,
            officer,
            organization,
            f"synthetic-demo-agent-site-{district.casefold()}",
            name=f"SYNTHETIC Agent showcase — demo {district}",
            site_type="orchard",
            province=province,
            district=district,
            sector="Demo sector",
            latitude=latitude,
            longitude=longitude,
        )
        for province, district, latitude, longitude in districts
    }
    kinds = list(species)
    conditions = ("surviving", "planted", "stressed", "unknown", "surviving", "planted")
    for number in range(1, 51):
        agent = _get_or_create_user(
            db,
            f"synthetic-agent-{number:02d}@demo.treelife.local",
            f"SYNTHETIC Agent {number:02d}",
            "field_officer",
            password,
        )
        _, district, latitude, longitude = districts[number % len(districts)]
        records = 2 + (number % 5)
        for slot in range(records):
            scientific_name = kinds[(number + slot) % len(kinds)]
            chosen = species[scientific_name]
            category = (
                chosen.category
                if chosen.category in {"urban", "fruit", "agroforestry", "other"}
                else "other"
            )
            point = None
            if slot < 1 + (number % 3):
                point = (
                    latitude + ((number % 6) - 2) * 0.02 + slot * 0.004,
                    longitude + ((number % 5) - 2) * 0.02 - slot * 0.003,
                )
            _tree(
                db,
                agent,
                sites[district],
                chosen,
                f"synthetic-demo-agent-{number:02d}-tree-{slot}",
                category=category,
                planting_date=date(2026, 1, 1) + timedelta(days=number * 3 + slot),
                status=conditions[slot],
                latitude=None if point is None else point[0],
                longitude=None if point is None else point[1],
                registered_at=datetime(2026, 3, 1, tzinfo=UTC) + timedelta(days=number * 4 + slot),
            )


def _sample_carbon(db, officer: User, admin: User) -> None:
    """Approve the demonstration officer and record 50 synthetic tree measurements.

    Coordinates come from trees already stored. The note marks every row as synthetic.
    """
    if (
        db.scalar(
            select(CarbonMeasurement).where(
                CarbonMeasurement.client_request_id == "synthetic-demo-carbon-001"
            )
        )
        is not None
    ):
        return
    latest = db.scalar(
        select(CarbonAuthorization)
        .where(CarbonAuthorization.user_id == officer.id)
        .order_by(CarbonAuthorization.created_at.desc())
        .limit(1)
    )
    if latest is not None and latest.status == "pending":
        latest.status = "approved"
        latest.decision_reason = "Approved for the local demonstration."
        latest.decided_by = admin.id
        latest.decided_at = utcnow()
        db.add(
            CarbonAuthorizationEvent(
                authorization_id=latest.id,
                user_id=officer.id,
                action="approved",
                reason="Approved for the local demonstration.",
                actor_id=admin.id,
            )
        )
    elif latest is None or latest.status != "approved":
        authorization = CarbonAuthorization(
            user_id=officer.id,
            status="approved",
            experience="SYNTHETIC demonstration authorization for the carbon monitoring showcase.",
            training="SYNTHETIC demonstration training record.",
            qualifications="SYNTHETIC demonstration qualification. Not a field certificate.",
            decision_reason="Approved for the local demonstration.",
            decided_by=admin.id,
            decided_at=utcnow(),
        )
        db.add(authorization)
        db.flush()
        db.add(
            CarbonAuthorizationEvent(
                authorization_id=authorization.id,
                user_id=officer.id,
                action="approved",
                reason="Approved for the local demonstration.",
                actor_id=admin.id,
            )
        )
    trees = list(
        db.scalars(select(IndividualTree).where(IndividualTree.latitude.isnot(None))).all()
    )
    grouped: dict = {}
    for tree in trees:
        grouped.setdefault(tree.species_id, []).append(tree)
    keys = list(grouped)
    chosen = []
    cursor = 0
    while len(chosen) < 50 and keys:
        key = keys[cursor % len(keys)]
        bucket = grouped[key]
        if bucket:
            chosen.append(bucket.pop())
            cursor += 1
        else:
            keys = [item for item in keys if grouped[item]]
    allowed = {"surviving", "stressed", "dead", "planted", "unknown"}
    for index, tree in enumerate(chosen, start=1):
        if index <= 40:
            review, reason = "accepted", None
        elif index <= 45:
            review, reason = "pending", None
        else:
            review, reason = "correction", "SYNTHETIC demonstration: height needs another check."
        row = CarbonMeasurement(
            public_code=allocate_code(db, CarbonMeasurement, "CARB"),
            tree_id=tree.id,
            species_id=tree.species_id,
            species_verified=True,
            latitude=tree.latitude,
            longitude=tree.longitude,
            dbh_cm=8 + (index % 25),
            height_m=3 + (index % 10),
            status=tree.status if tree.status in allowed else "surviving",
            measured_on=date(2026, 7, 1) + timedelta(days=index),
            notes=SYNTHETIC_NOTE,
            collected_by=officer.id,
            client_request_id=f"synthetic-demo-carbon-{index:03d}",
            review_status=review,
            review_reason=reason,
            reviewed_by=admin.id if review != "pending" else None,
            reviewed_at=utcnow() if review != "pending" else None,
        )
        store_carbon_estimate(db, row)
        db.add(row)
        if index > 5:
            continue
        earlier = CarbonMeasurement(
            public_code=allocate_code(db, CarbonMeasurement, "CARB"),
            tree_id=tree.id,
            species_id=tree.species_id,
            species_verified=True,
            latitude=tree.latitude,
            longitude=tree.longitude,
            dbh_cm=6 + index,
            height_m=3 + (index % 4),
            status="surviving",
            measured_on=date(2026, 5, 1) + timedelta(days=index),
            notes=SYNTHETIC_NOTE,
            collected_by=officer.id,
            client_request_id=f"synthetic-demo-carbon-history-{index:03d}",
            review_status="accepted",
            reviewed_by=admin.id,
            reviewed_at=utcnow(),
        )
        store_carbon_estimate(db, earlier)
        db.add(earlier)


def seed(allow_production: bool = False) -> None:
    settings = get_settings()
    if settings.is_production and not allow_production and not settings.seed_demo_data:
        raise SystemExit("Refusing to seed demonstration data when APP_ENV=production.")
    db = SessionLocal()
    try:
        apply_species_catalogue(db)
        species = _species_by_name(db)
        cooperative = _organization(db, "SYNTHETIC Demo Cooperative", "cooperative")
        greening = _organization(db, "SYNTHETIC City Greening Unit", "public_institution")
        admin = _get_or_create_user(
            db, "admin@demo.treelife.local", "Demo Admin", "admin", settings.demo_admin_password
        )
        officer = _get_or_create_user(
            db,
            "officer@demo.treelife.local",
            "Demo Field Officer",
            "field_officer",
            settings.demo_officer_password,
        )
        viewer = _get_or_create_user(
            db, "viewer@demo.treelife.local", "Demo Viewer", "viewer", settings.demo_viewer_password
        )
        smallholder = _get_or_create_user(
            db,
            "farmer@demo.treelife.local",
            "Farmer",
            "farmer",
            settings.demo_farmer_password,
        )
        smallholder.full_name = "Farmer"
        urban = _site(
            db,
            officer,
            greening,
            "synthetic-demo-site-urban-01",
            name="SYNTHETIC Urban plot — demo A",
            site_type="urban_plot",
            province="Kigali City",
            district="Nyarugenge",
            sector="Demo sector",
            latitude=-1.950000,
            longitude=30.060000,
        )
        orchard = _site(
            db,
            officer,
            cooperative,
            "synthetic-demo-site-orchard-01",
            name="SYNTHETIC Fruit orchard — demo B",
            site_type="orchard",
            province="Eastern Province",
            district="Bugesera",
            sector="Demo sector",
            area_hectares=1.5,
            latitude=-1.970000,
            longitude=30.100000,
        )
        _site(
            db,
            officer,
            cooperative,
            "synthetic-demo-site-nocoord-01",
            name="SYNTHETIC Roadside row — demo C",
            site_type="roadside",
            province="Southern Province",
            district="Huye",
            sector="Demo sector",
        )
        avocado = _tree(
            db,
            officer,
            orchard,
            species["Persea americana"],
            "synthetic-demo-tree-avocado-01",
            category="fruit",
            planting_date=date(2026, 3, 1),
            latitude=-1.970100,
            longitude=30.100200,
            status="surviving",
        )
        _tree(
            db,
            officer,
            urban,
            species["Jacaranda mimosifolia"],
            "synthetic-demo-tree-jacaranda-01",
            category="urban",
            planting_date=date(2025, 11, 12),
            latitude=-1.950200,
            longitude=30.060300,
        )
        _tree(
            db,
            officer,
            urban,
            species["Grevillea robusta"],
            "synthetic-demo-tree-nocoord-01",
            category="agroforestry",
            planting_date=date(2026, 1, 20),
        )
        mango_batch = _batch(
            db,
            officer,
            orchard,
            species["Mangifera indica"],
            "synthetic-demo-batch-mango-01",
            category="fruit",
            planting_date=date(2026, 2, 14),
            quantity=40,
            latitude=-1.969800,
            longitude=30.099700,
            status="planted",
        )
        _batch(
            db,
            officer,
            orchard,
            species["Carica papaya"],
            "synthetic-demo-batch-nocoord-01",
            category="fruit",
            planting_date=date(2026, 4, 2),
            quantity=15,
        )
        _event(
            db,
            officer,
            "synthetic-demo-event-tree-01",
            tree_id=avocado.id,
            event_type="inspection",
            event_date=date(2026, 9, 15),
            status_after="surviving",
        )
        _event(
            db,
            officer,
            "synthetic-demo-event-batch-01",
            batch_id=mango_batch.id,
            event_type="survival_check",
            event_date=date(2026, 8, 1),
            status_after="surviving",
            survival_count=36,
        )
        _value_chain(db, officer, cooperative, species, orchard, avocado, mango_batch, smallholder)
        _sample_health_trees(db, officer, cooperative, species)
        _sample_forests(db, officer, species)
        _sample_agents(db, officer, cooperative, species, settings.demo_officer_password)
        _sample_carbon(db, officer, admin)
        db.commit()
        print("Synthetic demonstration data is ready.")
        print("These accounts and coordinates are not real field records.")
        print("Fifty SYNTHETIC Agent accounts fill the overview list for the showcase.")
        print(f"Admin   {admin.email}")
        print(f"Officer {officer.email}")
        print(f"Viewer  {viewer.email}")
        print(f"Farmer  {smallholder.email}")
        print(
            "Passwords come from DEMO_ADMIN_PASSWORD, DEMO_OFFICER_PASSWORD, "
            "DEMO_VIEWER_PASSWORD, and DEMO_FARMER_PASSWORD."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    seed()


if __name__ == "__main__":
    main()
