"""Load clearly labelled synthetic demonstration records.

Refuses to run when APP_ENV=production. These rows are not field observations.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.entities import (
    Advisory,
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
    tree = IndividualTree(
        public_code=allocate_code(db, IndividualTree, "TREE"),
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
            display_name="SYNTHETIC Demo Producer",
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


def seed() -> None:
    settings = get_settings()
    if settings.is_production:
        raise SystemExit("Refusing to seed demonstration data when APP_ENV=production.")
    db = SessionLocal()
    try:
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
            "Demo Smallholder",
            "farmer",
            settings.demo_farmer_password,
        )
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
        db.commit()
        print("Synthetic demonstration data is ready.")
        print("These accounts and coordinates are not real field records.")
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
