from sqlalchemy import text

from app.data.species_catalogue import AVOCADO_VARIETIES, MANGO_VARIETIES, apply_species_catalogue
from app.db.session import SessionLocal
from tests.conftest import auth


def test_starter_catalogue_keeps_existing_names_and_adds_varieties(client, accounts):
    with SessionLocal() as db:
        db.execute(
            text(
                "INSERT INTO species (id, scientific_name, common_name, category) "
                "VALUES (gen_random_uuid(), 'Citrus sinensis', 'Sweet orange', 'fruit')"
            )
        )
        db.commit()
        apply_species_catalogue(db)
        apply_species_catalogue(db)
        db.commit()

    rows = client.get("/api/v1/species", headers=auth(accounts, "admin")).json()
    by_name = {item["scientific_name"]: item for item in rows}
    assert len(by_name) == 24
    orange = by_name["Citrus sinensis"]
    assert orange["common_name"] == "Sweet orange"
    assert orange["local_name"] is None
    assert orange["review_status"] == "verified"
    avocado = by_name["Persea americana"]
    assert avocado["local_name"] == "Avoka"
    assert avocado["growth_form"] == "tree"
    assert avocado["classifications"] == ["fruit"]
    assert sorted(item["name"] for item in avocado["varieties"]) == sorted(AVOCADO_VARIETIES)
    mango = by_name["Mangifera indica"]
    assert sorted(item["name"] for item in mango["varieties"]) == sorted(MANGO_VARIETIES)
    assert by_name["Carica papaya"]["growth_form"] == "herb"
    assert by_name["Carica papaya"]["classifications"] == []
    assert by_name["Passiflora edulis"]["growth_form"] == "vine"
    assert by_name["Psidium guajava"]["varieties"] == []
    assert by_name["Eucalyptus spp."]["taxon_rank"] == "genus"
    assert by_name["Eucalyptus spp."]["review_status"] == "needs_review"
    assert by_name["Ficus spp."]["review_status"] == "needs_review"
    assert by_name["Grevillea robusta"]["primary_uses"] is None
    assert by_name["Grevillea robusta"]["rwanda_suitability"] is None

    approved = {item["scientific_name"] for item in client.get("/api/v1/species?approved=true", headers=auth(accounts)).json()}
    assert "Persea americana" in approved
    assert "Grevillea robusta" in approved
    assert "Eucalyptus spp." not in approved
    assert "Ficus spp." not in approved

    denied = client.post(
        "/api/v1/species",
        json={"scientific_name": "Testus inventa", "common_name": "Test", "category": "other"},
        headers=auth(accounts),
    )
    assert denied.status_code == 403
