"""Role-scoped assistant. The provider key stays on the server."""

from __future__ import annotations

import logging
from collections import Counter

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.domain.errors import DomainError
from app.models.entities import Farmer, User
from app.services.dashboard import (
    planting_amount,
    read_inventory,
    read_outcomes,
    row_district,
    species_totals,
)

LIST_LIMIT = 30
MISSING_KEY = "Add GEMINI_API_KEY on the API, then try again."
UNAVAILABLE = (
    "The assistant is not available right now. Contact the person responsible, or try again later."
)
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"
logger = logging.getLogger(__name__)

ROLE_TASK = {
    "farmer": (
        "This person is a smallholder farmer. Advise them on the trees in the brief, "
        "from planting and watering through harvest and selling."
    ),
    "field_officer": (
        "This person is a field officer. Help them advise the farmers and plantings "
        "in the brief. Stay inside those records."
    ),
    "admin": (
        "This person is an administrator. Help them read the totals and notice "
        "what the records show. Do not invent a field visit."
    ),
    "viewer": (
        "This person is a viewer. Talk about species, districts, and counts only. "
        "Do not name farmers, officers, sites, or households."
    ),
}


def account_brief(db: Session, user: User) -> str:
    """Text the model may use. It contains only records this account can already open."""
    inventory = read_inventory(db, user)
    viewer = user.role == "viewer"
    names = {} if viewer else _farmer_names(db, inventory)
    lines = [
        f"Account: {user.full_name}",
        f"Role: {user.role}",
        ROLE_TASK.get(user.role, ROLE_TASK["viewer"]),
        "Records below are what this account is allowed to see.",
    ]
    if any(row.data_origin == "synthetic_demo" for row in inventory.plantings):
        lines.append("Some records are SYNTHETIC demonstration data, not field results.")

    totals = species_totals(inventory)
    if totals:
        lines.append(
            "Species counts: "
            + "; ".join(f"{row.species_common_name} {row.trees}" for row in totals)
        )
    else:
        lines.append("Species counts: none recorded.")

    standing = sum(
        planting_amount(row) for row in inventory.plantings if row.status not in {"dead", "removed"}
    )
    recorded = sum(planting_amount(row) for row in inventory.plantings)
    lines.append(f"Trees standing: {standing}. Trees recorded: {recorded}.")

    districts = Counter()
    for row in inventory.plantings:
        district = row_district(row)
        if district:
            districts[district] += planting_amount(row)
    if districts:
        listed = ", ".join(f"{name} {count}" for name, count in districts.most_common(12))
        lines.append(f"Districts: {listed}.")

    if not viewer:
        lines.extend(_care_lines(db, inventory, names))
    lines.append("If a fact is not in this brief, say that the account has no such record.")
    return "\n".join(lines)


def reply(db: Session, user: User, messages: list[tuple[str, str]]) -> str:
    key, base_url, model = _provider()
    if not key:
        raise DomainError(MISSING_KEY, status_code=503)
    payload = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 500,
        "reasoning_effort": "none",
        "messages": [
            {"role": "system", "content": _instructions()},
            {"role": "system", "content": account_brief(db, user)},
            *[{"role": role, "content": content} for role, content in messages],
        ],
    }
    url = base_url.rstrip("/") + "/chat/completions"
    try:
        with httpx.Client(timeout=45) as client:
            response = client.post(
                url,
                headers={"Authorization": f"Bearer {key}"},
                json=payload,
            )
            if response.status_code >= 400:
                logger.warning(
                    "Assistant provider returned %s for model %s", response.status_code, model
                )
                raise DomainError(UNAVAILABLE, status_code=502)
            text = _message_text(response.json())
    except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
        logger.warning("Assistant provider call failed for model %s", model)
        raise DomainError(UNAVAILABLE, status_code=502) from exc
    cleaned = concise_reply(str(text))
    if not cleaned:
        raise DomainError(UNAVAILABLE, status_code=502)
    return cleaned


def _provider() -> tuple[str, str, str]:
    settings = get_settings()
    assistant_key = settings.assistant_api_key.strip()
    gemini_key = settings.gemini_api_key.strip()
    if assistant_key:
        return (
            assistant_key,
            settings.assistant_api_base_url.strip() or "https://api.openai.com/v1",
            settings.assistant_model.strip() or settings.chat_model.strip() or "gpt-4o-mini",
        )
    if gemini_key:
        return (
            gemini_key,
            settings.assistant_api_base_url.strip() or GEMINI_BASE,
            settings.chat_model.strip() or settings.assistant_model.strip() or "gemini-3.5-flash",
        )
    return "", "", ""


def _message_text(body: dict) -> str:
    content = body["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = " ".join(
            part.get("text", "") if isinstance(part, dict) else str(part) for part in content
        )
    return "" if content is None else str(content)


def concise_reply(text: str) -> str:
    """Keep a phone-sized answer: one sentence, or up to three counted records."""
    lines = [cleaned for raw in text.splitlines() if (cleaned := _plain_line(raw))]
    sentence = next((line for line in lines if _is_sentence(line)), "")
    if sentence and _says_nothing_is_scheduled(sentence):
        return sentence
    facts = [_short_fact(line) for line in lines if _is_fact(line)][:5]
    if facts:
        return "\n".join(facts)
    return sentence


def _plain_line(raw: str) -> str:
    """Turn Markdown into a plain sentence or a dash line, with no asterisks left."""
    if not raw.strip():
        return ""
    line = raw.strip().lstrip("#").strip()
    bullet = line.startswith(("* ", "- ", "• "))
    body = line.replace("**", "").replace("__", "").lstrip("*-• ").replace("*", "").strip()
    body = " ".join(body.split())
    if not body:
        return ""
    return f"- {body}" if bullet else body


def _is_sentence(line: str) -> bool:
    if line.startswith("- ") or _is_title(line):
        return False
    lowered = line.lower()
    return not lowered.startswith(("if you", "let me know")) and " here is" not in f" {lowered}"


def _is_title(line: str) -> bool:
    """A label such as 'Tree Totals & Status', which is not an answer."""
    if any(char.isdigit() for char in line) or line.endswith((".", "?", "!")):
        return False
    return len(line.split()) <= 8


def _is_fact(line: str) -> bool:
    if ":" not in line or not any(char.isdigit() for char in line) or _blank_label(line):
        return False
    label = line.lstrip("- ").split(":", 1)[0].lower()
    blocked = ("total", "district", "care", "overview", "breakdown", "harvest", "sales", "activity")
    return not any(word in label for word in blocked)


def _short_fact(line: str) -> str:
    body = line.lstrip("- ").split("(", 1)[0].strip().rstrip(" ,")
    return f"- {body}"


def _blank_label(line: str) -> bool:
    """A place heading with nothing after the colon, such as 'Bugesera District (...):'."""
    body = line.lstrip("*-• ").replace("**", "").strip()
    return body.endswith(":")


def _says_nothing_is_scheduled(line: str) -> bool:
    lowered = line.lower()
    return any(
        phrase in lowered
        for phrase in (
            "no information",
            "no schedule",
            "no visit",
            "not scheduled",
            "no such record",
        )
    )


def _instructions() -> str:
    return (
        "You are the TreeLife assistant for one signed-in account in Rwanda. "
        "Use only the account brief. Do not invent trees, yields, visits, prices, or partners. "
        "Demonstration records are not field results. "
        "Do not ask for a national ID or a phone number. "
        "Write for a phone screen. Use at most four short lines. "
        "No introduction, no closing offer, no headings, and no asterisks. "
        "Answer only the question. "
        "The records do not include a visit list. "
        "When nothing says who needs a visit, say that in one sentence and stop. "
        "When asked what to say about the recorded trees, list the species, the count, and the status. "
        "Do not add a district or a site unless the question asks where the trees are. "
        "Use a dash list only when naming more than one record that answers the question."
    )


def _farmer_names(db: Session, inventory) -> dict:
    ids = {row.farmer_id for row in [*inventory.plantings, *inventory.sites] if row.farmer_id}
    for row in inventory.plantings:
        site = getattr(row, "site", None)
        if site is not None and site.farmer_id:
            ids.add(site.farmer_id)
    if not ids:
        return {}
    rows = db.execute(select(Farmer.id, Farmer.display_name).where(Farmer.id.in_(ids))).all()
    return {row.id: row.display_name for row in rows}


def _care_lines(db: Session, inventory, names: dict) -> list[str]:
    outcomes = read_outcomes(db, inventory)
    harvested = Counter()
    for row in outcomes.harvests:
        harvested[row.unit] += row.quantity
    sales = sum(row.amount_rwf for row in outcomes.sales)
    care = Counter(row.activity_type for row in outcomes.maintenance)
    lines = [
        "Harvest: "
        + (", ".join(f"{unit} {amount:g}" for unit, amount in sorted(harvested.items())) or "none"),
        f"Sales: {sales:g} RWF.",
        "Care records: "
        + (", ".join(f"{kind} {count}" for kind, count in sorted(care.items())) or "none"),
    ]
    plantings = inventory.plantings
    shown = plantings[:LIST_LIMIT]
    if shown:
        lines.append("Plantings:")
        lines.extend(f"- {_planting_line(row, names)}" for row in shown)
    hidden = len(plantings) - len(shown)
    if hidden:
        lines.append(
            f"{hidden} further plantings are included in the counts and left off this list."
        )
    return lines


def _planting_line(row, names: dict) -> str:
    species = row.species.common_name if row.species is not None else "Unknown species"
    parts = [f"{planting_amount(row)} {species}", row.status, str(row.planting_date)]
    district = row_district(row)
    if district:
        parts.append(district)
    site = getattr(row, "site", None)
    if site is not None:
        parts.append(site.name)
    farmer_id = row.farmer_id or (site.farmer_id if site is not None else None)
    if farmer_id and names.get(farmer_id):
        parts.append(names[farmer_id])
    care = []
    for label, value in (
        ("water", getattr(row, "water_availability", None)),
        ("watering", getattr(row, "watering_provided", None)),
        ("mulch", getattr(row, "mulching_applied", None)),
        ("fertilizer", getattr(row, "fertilizer_applied", None)),
    ):
        if value:
            care.append(f"{label} {value}")
    if care:
        parts.append(", ".join(care))
    if row.data_origin == "synthetic_demo":
        parts.append("SYNTHETIC")
    return " · ".join(parts)
