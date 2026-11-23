"""Role-scoped assistant. The provider key stays on the server."""

from __future__ import annotations

import logging
import re
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
UNAVAILABLE = "Sorry, the assistant is unavailable right now. Contact the person responsible, or try again soon."
_UNAVAILABLE = {
    "en": UNAVAILABLE,
    "rw": "Ihangane, umufasha ntari hano ubu. Vugana n'uwubishinzwe, cyangwa ugerageze vuba.",
    "fr": "Désolé, l'assistant n'est pas disponible pour le moment. Contactez la personne responsable, ou réessayez bientôt.",
}
_RW_WORDS = {
    "muraho",
    "mwiriwe",
    "mwaramutse",
    "bite",
    "murakoze",
    "yego",
    "oya",
    "nigute",
    "gute",
    "igiti",
    "ibiti",
    "umusaruro",
    "amazi",
    "ifumbire",
    "cyanjye",
    "cyane",
    "ndashaka",
    "nakwitaho",
    "witaho",
    "ese",
    "kandi",
    "ariko",
    "kuko",
    "ubu",
    "avoka",
    "ubuhinzi",
    "imbuto",
    "ndumva",
    "wowe",
    "ikibazo",
    "indwara",
    "udukoko",
}
_FR_WORDS = {
    "bonjour",
    "bonsoir",
    "salut",
    "merci",
    "comment",
    "puis",
    "je",
    "nous",
    "vous",
    "les",
    "des",
    "une",
    "pour",
    "avec",
    "dans",
    "récolte",
    "recolte",
    "mangue",
    "mangues",
    "arbre",
    "arbres",
    "améliorer",
    "ameliorer",
    "arrosage",
    "arroser",
    "engrais",
    "maladie",
    "plantation",
    "mon",
    "mes",
    "que",
    "quoi",
    "puis-je",
}
_EN_WORDS = {
    "hi",
    "hello",
    "how",
    "can",
    "my",
    "the",
    "what",
    "please",
    "improve",
    "harvest",
    "tree",
    "trees",
    "should",
    "which",
    "water",
    "mango",
    "help",
    "about",
    "where",
    "when",
    "does",
    "do",
}
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
    categories = Counter()
    for row in inventory.plantings:
        label = {
            "urban": "Urban",
            "fruit": "Fruit",
            "agroforestry": "Agroforestry",
            "other": "Other",
        }.get(getattr(row, "category", ""))
        if label:
            categories[label] += planting_amount(row)
    if categories:
        lines.append(
            "Categories: "
            + "; ".join(f"{name} {count}" for name, count in categories.most_common())
        )

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


def detect_language(text: str) -> str:
    """Return en, rw, or fr from the words in one message. English is the default."""
    scores = _language_scores(text)
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "en"
    leaders = [language for language, score in scores.items() if score == scores[best]]
    if len(leaders) == 1:
        return leaders[0]
    return "en" if "en" in leaders else leaders[0]


def conversation_language(messages: list[tuple[str, str]]) -> str:
    """Follow the latest question, then earlier questions if that one has no cue."""
    asked = [content for role, content in messages if role == "user" and content.strip()]
    if not asked:
        return "en"
    if max(_language_scores(asked[-1]).values()):
        return detect_language(asked[-1])
    return detect_language(" ".join(asked))


def _language_scores(text: str) -> dict[str, int]:
    scores = {"en": 0, "rw": 0, "fr": 0}
    for word in re.findall(r"[0-9a-zà-ÿ']+", text.lower()):
        if word in _RW_WORDS:
            scores["rw"] += 2
        if word in _FR_WORDS:
            scores["fr"] += 1
        if word in _EN_WORDS:
            scores["en"] += 1
    return scores


def reply(db: Session, user: User, messages: list[tuple[str, str]]) -> str:
    language = conversation_language(messages)
    key, base_url, model = _provider()
    if not key:
        logger.warning("Assistant key is not set")
        raise DomainError(_UNAVAILABLE[language], status_code=503)
    payload = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 500,
        "reasoning_effort": "none",
        "messages": [
            {"role": "system", "content": _instructions(language)},
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
                raise DomainError(_UNAVAILABLE[language], status_code=502)
            text = _message_text(response.json())
    except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
        logger.warning("Assistant provider call failed for model %s", model)
        raise DomainError(_UNAVAILABLE[language], status_code=502) from exc
    question = next((content for role, content in reversed(messages) if role == "user"), "")
    cleaned = concise_reply(str(text), question, language)
    if not cleaned:
        raise DomainError(_UNAVAILABLE[language], status_code=502)
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


_OFF_TOPIC = {
    "en": "I can help with the trees, care, harvest, and records on this account.",
    "rw": "Nshobora kugufasha ku biti, kwita, umusaruro, n'inyandiko ziri kuri konti yawe.",
    "fr": "Je peux aider pour les arbres, l'entretien, la récolte et les dossiers de ce compte.",
}

_TREE_CUES = (
    "tree",
    "plant",
    "harvest",
    "species",
    "farmer",
    "site",
    "carbon",
    "nursery",
    "water",
    "pest",
    "sale",
    "record",
    "district",
    "visit",
    "fruit",
    "forest",
    "seed",
    "agro",
    "prune",
    "mulch",
    "fertil",
    "mango",
    "papaya",
    "avocado",
    "batch",
    "care",
    "seedling",
    "survival",
    "how many",
    "summar",
    "what do we",
    "which ",
    "categor",
    "overview",
    "igiti",
    "ibiti",
    "umusaruro",
    "pepiniyeri",
    "umuhinzi",
    "arbre",
    "récolte",
    "recolte",
    "pépinière",
    "pepiniere",
    "espèce",
    "espece",
    "entretien",
)


def _about_trees(question: str) -> bool:
    asked = question.lower()
    return any(cue in asked for cue in _TREE_CUES)


def concise_reply(text: str, question: str = "", language: str = "en") -> str:
    """Keep a phone-sized answer that follows the question."""
    if question.strip() and not _about_trees(question):
        return _OFF_TOPIC.get(language, _OFF_TOPIC["en"])
    if language != "en":
        return _local_reply(text)
    asked_early = question.lower()
    if _asks(asked_early, ("how can", "how do", "improve", "advice", "should i")):
        return _local_reply(text)
    lines = [cleaned for raw in text.splitlines() if (cleaned := _plain_line(raw))]
    sentence = next((line for line in lines if _is_sentence(line) and not _is_aside(line)), "")
    if sentence and _says_nothing_is_scheduled(sentence):
        return sentence
    asked = question.lower()
    if _asks(asked, ("visit", "who needs", "which farmer")):
        return sentence or "The records do not include a visit list."
    species = [fact for line in lines if _is_species(line) and (fact := _short_fact(line))]
    if _asks(asked, ("species", "which tree", "what tree")) and species:
        return "\n".join(species)
    if _asks(asked, ("categor", "type", "kind")):
        listed = [fact for line in lines if _is_fact(line) and (fact := _short_fact(line))]
        if listed:
            return "\n".join(listed)
    if _asks(asked, ("where", "district", "location")):
        places = [
            fact
            for line in lines
            if "district" in line.lower() and _is_fact(line) and (fact := _short_fact(line))
        ]
        if places:
            return "\n".join(places)
    if _asks(asked, ("harvest", "sale", "sold", "fruit")):
        production = [
            part for part in (_fact_value(lines, "harvest"), _fact_value(lines, "sale")) if part
        ]
        if production:
            return ". ".join(part.rstrip(".") for part in production) + "."
    if _asks(asked, ("care", "water", "mulch")):
        care = [
            fact
            for line in lines
            if _is_fact(line)
            and _asks(line.lower(), ("mulch", "water", "care", "prun"))
            and (fact := _short_fact(line))
        ]
        if care:
            return "\n".join(care)
    overview = [
        part
        for part in (
            _fact_value(lines, "standing"),
            _fact_value(lines, "harvest"),
            _fact_value(lines, "sale"),
        )
        if part
    ]
    if _asks(asked, ("what do we", "what we have")):
        care = [
            _short_fact(line).lstrip("- ")
            for line in lines
            if _is_fact(line) and _asks(line.lower(), ("mulch", "water", "prun"))
        ]
        parts = overview + care
        if parts:
            return ". ".join(part.rstrip(".") for part in parts) + "."
    if overview and _asks(asked, ("summar", "overview", "records")):
        return ". ".join(part.rstrip(".") for part in overview) + "."
    finished = _complete(lines)
    if finished:
        return finished
    if species:
        return "\n".join(species)
    if overview:
        return ". ".join(part.rstrip(".") for part in overview) + "."
    return ""


def _local_reply(text: str) -> str:
    """Keep a short answer in the language the model already used."""
    lines = [cleaned for raw in text.splitlines() if (cleaned := _plain_line(raw))]
    kept: list[str] = []
    for line in lines:
        if _is_aside(line) or _is_closer(line) or _is_lead_in(line) or _is_intro(line):
            continue
        kept.append(line[2:] if line.startswith("- ") else line)
        if len(kept) >= 4:
            break
    return "\n".join(kept)


def _complete(lines: list[str]) -> str:
    """Keep a short answer, including the list that follows a lead-in."""
    kept: list[str] = []
    prose = 0
    for line in lines:
        if _is_aside(line) or _blank_label(line) or _is_title(line) or _is_closer(line):
            continue
        if line.startswith("- "):
            fact = _short_fact(line)
            if fact:
                kept.append(fact)
            continue
        if _is_lead_in(line) or _is_intro(line):
            continue
        if prose >= 2:
            continue
        kept.append(line)
        prose += 1
    return "\n".join(kept)


def _asks(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def _fact_value(lines: list[str], word: str) -> str:
    for line in lines:
        if not _is_fact(line):
            continue
        label = line.lstrip("- ").split(":", 1)[0].lower()
        if word in label:
            return _short_fact(line).lstrip("- ")
    return ""


def _is_species(line: str) -> bool:
    if not _is_fact(line):
        return False
    label = line.lstrip("- ").split(":", 1)[0].lower()
    blocked = ("total", "tree", "harvest", "sale", "district", "mulch", "water", "care", "record")
    return not any(word in label for word in blocked)


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
    if line.startswith("- ") or _is_title(line) or _is_aside(line):
        return False
    lowered = line.lower()
    return not lowered.startswith(("if you", "let me know")) and " here is" not in f" {lowered}"


def _is_title(line: str) -> bool:
    """A label such as 'Tree Totals & Status', which is not an answer."""
    if any(char.isdigit() for char in line) or line.endswith((".", "?", "!")):
        return False
    return len(line.split()) <= 8


def _is_lead_in(line: str) -> bool:
    """A line that only introduces a list, such as one ending in 'as follows'."""
    lowered = line.lower().rstrip(" .:")
    return lowered.endswith(("as follows", "following", "below")) or line.rstrip().endswith(":")


def _is_intro(line: str) -> bool:
    lowered = f" {line.lower()}"
    return " here is" in lowered


def _is_closer(line: str) -> bool:
    lowered = line.lower()
    return any(
        phrase in lowered
        for phrase in (
            "if you",
            "let me know",
            "i can also",
            "i can explain",
            "would you like",
            "if that would",
            "more detail",
            "n'hésitez",
            "n'hesitez",
            "si vous voulez",
            "souhaitez-vous",
            "niba ushaka",
            "menya ko",
        )
    )


def _is_aside(line: str) -> bool:
    body = line.lstrip("- ").lower()
    return body.startswith(("(note", "note:"))


def _is_fact(line: str) -> bool:
    if _is_aside(line):
        return False
    if ":" not in line or not any(char.isdigit() for char in line) or _blank_label(line):
        return False
    label = line.lstrip("- ").split(":", 1)[0].lower()
    blocked = ("breakdown", "overview", "activity")
    return not any(word in label for word in blocked)


def _short_fact(line: str) -> str:
    body = line.lstrip("- ").split("(", 1)[0].strip().rstrip(" ,")
    if not body:
        return ""
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


def _instructions(language: str = "en") -> str:
    names = {"en": "English", "rw": "Kinyarwanda", "fr": "French"}
    chosen = names.get(language, "English")
    return (
        "You are the TreeLife assistant for one signed-in account in Rwanda. "
        f"The person's latest message is in {chosen}. Answer only in natural {chosen}. "
        "Answer only questions about this account's trees, planting, care, harvest, sales, carbon, or how to use TreeLife. "
        "If the question is about anything else, including recipes, homework, or general chat, reply with one sentence that you can help with the trees and records on this account, then stop. "
        "Do not ask them to switch language, and do not answer in another language. "
        "Use everyday words a farmer can follow for planting, watering, fertilizer, pests, "
        "tree health, harvest, and agroforestry. "
        "When the brief already names their trees or a recorded practice, use that. "
        "Use only the account brief. Do not invent trees, yields, visits, prices, or partners. "
        "Demonstration records are not field results. "
        "Do not ask for a national ID or a phone number. "
        "Write for a phone screen. Give a complete answer in one or two short sentences. "
        "When the question asks for species, categories, or places, finish with a short list of every matching item. "
        "Never stop after 'as follows' or a colon. "
        "Categories are urban, fruit, agroforestry, and other. Use the category counts in the brief for those questions. "
        "No introduction, no extra paragraph, no closing offer, no headings, and no asterisks. "
        "Do not reply with the species list unless the question asks which species or how many of each. "
        "A summary mentions trees standing, care, harvest, and sales when the brief includes them. "
        "Do not repeat an earlier species list for a follow-up question. "
        "The records do not include a visit list. "
        "When nothing says who needs a visit, say that in one sentence and stop. "
        "Do not add a district or a site unless the question asks where the trees are."
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
