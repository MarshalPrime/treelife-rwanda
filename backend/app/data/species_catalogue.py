"""Starter species names for the registration list.

This is not an official national list. Empty fields stay empty.
Existing rows keep a common name, category, or any value already stored.
"""

from __future__ import annotations

import json
import uuid

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

SOURCE = "TreeLife starter catalogue. Not an official national species list."

AVOCADO_VARIETIES = (
    "Hass",
    "Fuerte",
    "Ettinger",
    "Booth",
    "Choquette",
    "Collinson",
    "Nabal",
    "Puebla",
    "Reed",
    "Simmonds",
    "Pinkerton",
    "Bacon",
)

MANGO_VARIETIES = (
    "Zillate",
    "Alfonso",
    "Apple",
    "Kent",
    "Keitt",
    "Sensation",
    "Tommy Atkins",
    "Bire",
    "Dodo",
)

# Classifications use the registration labels. A herb or vine is not called a fruit tree.
# Harvest type "Fruit" is taken from the fruit-producing group in this starter list.
# Local names are stored only when this list gives one. "Amacunga" is not stored:
# it was marked for verification. Genus entries are not approved for field selection.
CATALOGUE: tuple[dict, ...] = (
    {
        "scientific_name": "Persea americana",
        "common_name": "Avocado",
        "local_name": "Avoka",
        "growth_form": "tree",
        "classifications": ["fruit"],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": AVOCADO_VARIETIES,
    },
    {
        "scientific_name": "Mangifera indica",
        "common_name": "Mango",
        "local_name": "Umwembe",
        "growth_form": "tree",
        "classifications": ["fruit"],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": MANGO_VARIETIES,
    },
    {
        "scientific_name": "Psidium guajava",
        "common_name": "Guava",
        "local_name": "Amapera",
        "growth_form": "tree",
        "classifications": ["fruit"],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Carica papaya",
        "common_name": "Papaya",
        "local_name": "Ipapayi",
        "growth_form": "herb",
        "classifications": [],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Citrus sinensis",
        "common_name": "Orange",
        "local_name": None,
        "growth_form": "tree",
        "classifications": ["fruit"],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Citrus limon",
        "common_name": "Lemon",
        "local_name": "Indimu",
        "growth_form": "tree",
        "classifications": ["fruit"],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Solanum betaceum",
        "common_name": "Tamarillo",
        "local_name": "Ikinyomoro",
        "growth_form": None,
        "classifications": None,
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Passiflora edulis",
        "common_name": "Passion fruit",
        "local_name": "Amatunda",
        "growth_form": "vine",
        "classifications": [],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Artocarpus heterophyllus",
        "common_name": "Jackfruit",
        "local_name": "Igifenesi",
        "growth_form": "tree",
        "classifications": ["fruit"],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Annona muricata",
        "common_name": "Soursop",
        "local_name": "Keri de befu",
        "growth_form": "tree",
        "classifications": ["fruit"],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Punica granatum",
        "common_name": "Pomegranate",
        "local_name": None,
        "growth_form": None,
        "classifications": None,
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Syzygium cumini",
        "common_name": "Java plum",
        "local_name": None,
        "growth_form": "tree",
        "classifications": ["fruit"],
        "category": "fruit",
        "harvest_potential": True,
        "harvest_type": "Fruit",
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Eucalyptus spp.",
        "common_name": "Eucalyptus",
        "local_name": None,
        "growth_form": None,
        "classifications": None,
        "category": "other",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "genus",
        "review_status": "needs_review",
        "varieties": (),
    },
    {
        "scientific_name": "Grevillea robusta",
        "common_name": "Grevillea",
        "local_name": None,
        "growth_form": "tree",
        "classifications": ["agroforestry"],
        "category": "agroforestry",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Alnus acuminata",
        "common_name": "Alnus",
        "local_name": None,
        "growth_form": "tree",
        "classifications": None,
        "category": "other",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Calliandra calothyrsus",
        "common_name": "Calliandra",
        "local_name": None,
        "growth_form": "shrub",
        "classifications": ["agroforestry"],
        "category": "agroforestry",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Markhamia lutea",
        "common_name": "Markhamia",
        "local_name": None,
        "growth_form": "tree",
        "classifications": ["agroforestry"],
        "category": "agroforestry",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Erythrina abyssinica",
        "common_name": "African coral tree",
        "local_name": None,
        "growth_form": "tree",
        "classifications": None,
        "category": "other",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Ficus spp.",
        "common_name": "Fig tree",
        "local_name": None,
        "growth_form": None,
        "classifications": None,
        "category": "other",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "genus",
        "review_status": "needs_review",
        "varieties": (),
    },
    {
        "scientific_name": "Jacaranda mimosifolia",
        "common_name": "Jacaranda",
        "local_name": None,
        "growth_form": "tree",
        "classifications": ["ornamental"],
        "category": "urban",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Pinus patula",
        "common_name": "Pine",
        "local_name": None,
        "growth_form": "tree",
        "classifications": None,
        "category": "other",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Moringa oleifera",
        "common_name": "Moringa",
        "local_name": None,
        "growth_form": "tree",
        "classifications": None,
        "category": "other",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Cupressus lusitanica",
        "common_name": "Cypress",
        "local_name": None,
        "growth_form": "tree",
        "classifications": None,
        "category": "other",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
    {
        "scientific_name": "Sesbania sesban",
        "common_name": "Sesbania",
        "local_name": None,
        "growth_form": "shrub",
        "classifications": None,
        "category": "other",
        "harvest_potential": None,
        "harvest_type": None,
        "taxon_rank": "species",
        "review_status": "verified",
        "varieties": (),
    },
)


def _json(value: list[str] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


def apply_species_catalogue(connection: Connection | Session) -> None:
    """Insert missing species and fill only blank profile fields."""
    for item in CATALOGUE:
        existing = (
            connection.execute(
                text(
                    "SELECT id, data_source FROM species "
                    "WHERE lower(scientific_name) = lower(:scientific_name)"
                ),
                {"scientific_name": item["scientific_name"]},
            )
            .mappings()
            .first()
        )
        if existing is None:
            species_id = uuid.uuid4()
            connection.execute(
                text(
                    """
                    INSERT INTO species (
                        id, scientific_name, common_name, local_name, category,
                        harvest_potential, harvest_type, growth_form, classifications,
                        data_source, review_status, taxon_rank
                    ) VALUES (
                        :id, :scientific_name, :common_name, :local_name, :category,
                        :harvest_potential, :harvest_type, :growth_form,
                        CAST(:classifications AS jsonb), :data_source, :review_status,
                        :taxon_rank
                    )
                    """
                ),
                {
                    "id": species_id,
                    "scientific_name": item["scientific_name"],
                    "common_name": item["common_name"],
                    "local_name": item["local_name"],
                    "category": item["category"],
                    "harvest_potential": item["harvest_potential"],
                    "harvest_type": item["harvest_type"],
                    "growth_form": item["growth_form"],
                    "classifications": _json(item["classifications"]),
                    "data_source": SOURCE,
                    "review_status": item["review_status"],
                    "taxon_rank": item["taxon_rank"],
                },
            )
        else:
            species_id = existing["id"]
            connection.execute(
                text(
                    """
                    UPDATE species SET
                        local_name = COALESCE(local_name, :local_name),
                        harvest_potential = COALESCE(harvest_potential, :harvest_potential),
                        harvest_type = COALESCE(harvest_type, :harvest_type),
                        growth_form = COALESCE(growth_form, :growth_form),
                        classifications = COALESCE(classifications, CAST(:classifications AS jsonb)),
                        data_source = COALESCE(data_source, :data_source),
                        review_status = CASE
                            WHEN data_source IS NULL THEN :review_status
                            ELSE review_status
                        END,
                        taxon_rank = CASE
                            WHEN data_source IS NULL THEN :taxon_rank
                            ELSE taxon_rank
                        END
                    WHERE id = :id
                    """
                ),
                {
                    "id": species_id,
                    "local_name": item["local_name"],
                    "harvest_potential": item["harvest_potential"],
                    "harvest_type": item["harvest_type"],
                    "growth_form": item["growth_form"],
                    "classifications": _json(item["classifications"]),
                    "data_source": SOURCE,
                    "review_status": item["review_status"],
                    "taxon_rank": item["taxon_rank"],
                },
            )
        for name in item["varieties"]:
            connection.execute(
                text(
                    """
                    INSERT INTO species_varieties (id, species_id, name)
                    SELECT :id, :species_id, CAST(:name AS varchar)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM species_varieties
                        WHERE species_id = :species_id AND lower(name) = lower(CAST(:name AS varchar))
                    )
                    """
                ),
                {"id": uuid.uuid4(), "species_id": species_id, "name": name},
            )
