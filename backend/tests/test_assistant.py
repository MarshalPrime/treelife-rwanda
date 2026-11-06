from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import User
from app.services.assistant import UNAVAILABLE, account_brief, concise_reply
from tests.conftest import auth, make_site, make_species
from tests.test_dashboard import register_user


def test_reply_stays_short_enough_for_a_phone():
    long = """Based on your records, no visit is scheduled.

Your current records only show the following plantings:
* **Bugesera:** 1 avocado, 40 mango
  * planted 2026-03-01
* **Nyarugenge:** 1 jacaranda
If you need more detail, let me know.
"""
    short = concise_reply(long)
    assert short == "Based on your records, no visit is scheduled."
    assert "Bugesera" not in short
    assert "planted 2026-03-01" not in short
    plain = concise_reply("Here is a summary of the trees you have recorded:**")
    assert "**" not in plain
    visit = concise_reply(
        "Based on your records, there is no information or specific schedule "
        "indicating which farmers need a visit.\n"
        "Bugesera District (SYNTHETIC Fruit orchard — demo B):\n"
        "Nyarugenge District (SYNTHETIC Urban plot — demo A):\n"
    )
    assert "no information" in visit
    assert "Bugesera" not in visit
    assert "Nyarugenge" not in visit
    trees = concise_reply(
        "Based on your records, here is the summary:\n\n"
        "### **Tree Totals & Status**\n"
        "* **Total Trees Recorded:** 58 trees across two districts.\n"
        "* **Species Breakdown:**\n"
        "  * **Mango:** 40 trees (Planted in Bugesera)\n"
        "  * **Papaya:** 15 trees (Planted in Bugesera)\n"
        "  * **Avocado:** 1 tree (Surviving)\n"
        "  * **Grevillea:** 1 tree (Planted)\n"
    )
    assert "Tree Totals" not in trees
    assert "here is" not in trees.lower()
    assert "*" not in trees
    assert "Bugesera" not in trees
    assert trees.splitlines() == [
        "- Mango: 40 trees",
        "- Papaya: 15 trees",
        "- Avocado: 1 tree",
        "- Grevillea: 1 tree",
    ]


def test_brief_stays_inside_the_signed_in_account(client, accounts):
    avocado = make_species(client, accounts, "Persea americana", "Avocado")
    site = make_site(client, accounts, name="Officer plot", client_request_id="assistant-site")
    officer_tree = client.post(
        "/api/v1/trees",
        json={
            "site_id": site.json()["id"],
            "species_id": avocado["id"],
            "category": "fruit",
            "planting_date": "2026-02-01",
            "client_request_id": "assistant-avocado",
        },
        headers=auth(accounts),
    )
    assert officer_tree.status_code == 201, officer_tree.text

    farmer_headers, _ = register_user(
        client, "farmer", "assistant-farmer@test.treelife.local", name="Household One"
    )
    mango = make_species(client, accounts, "Mangifera indica", "Mango")
    farmer_tree = client.post(
        "/api/v1/trees",
        json={
            "species_id": mango["id"],
            "category": "fruit",
            "planting_date": "2026-03-01",
            "client_request_id": "assistant-mango",
        },
        headers=farmer_headers,
    )
    assert farmer_tree.status_code == 201, farmer_tree.text

    with SessionLocal() as db:
        farmer = db.scalar(select(User).where(User.email == "assistant-farmer@test.treelife.local"))
        officer = db.scalar(select(User).where(User.email == accounts["field_officer"]["email"]))
        viewer = db.scalar(select(User).where(User.email == accounts["viewer"]["email"]))
        farmer_brief = account_brief(db, farmer)
        officer_brief = account_brief(db, officer)
        viewer_brief = account_brief(db, viewer)

    assert "Mango" in farmer_brief
    assert "Avocado" not in farmer_brief
    assert "Avocado" in officer_brief
    assert "Mango" not in officer_brief
    assert "Officer plot" in officer_brief
    assert "Avocado" in viewer_brief
    assert "Household One" not in viewer_brief
    assert "Officer plot" not in viewer_brief


def test_assistant_waits_for_a_key(client, accounts, monkeypatch):
    monkeypatch.setenv("ASSISTANT_API_KEY", "")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    get_settings.cache_clear()
    response = client.post(
        "/api/v1/assistant",
        json={"messages": [{"role": "user", "content": "What should I do next?"}]},
        headers=auth(accounts),
    )
    get_settings.cache_clear()
    assert response.status_code == 503, response.text
    assert response.json()["detail"] == UNAVAILABLE
    assert "API" not in response.text
    assert "GEMINI" not in response.text


def test_assistant_sends_the_account_brief_to_the_configured_api(client, accounts, monkeypatch):
    monkeypatch.setenv("ASSISTANT_API_KEY", "test-key")
    monkeypatch.setenv("ASSISTANT_API_BASE_URL", "https://assistant.test/v1")
    monkeypatch.setenv("ASSISTANT_MODEL", "test-model")
    get_settings.cache_clear()
    captured = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": "Water during a dry week."}}]}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            return None

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers, json):
            captured["url"] = url
            captured["authorization"] = headers["Authorization"]
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr("app.services.assistant.httpx.Client", FakeClient)
    response = client.post(
        "/api/v1/assistant",
        json={"messages": [{"role": "user", "content": "What should I water?"}]},
        headers=auth(accounts, "viewer"),
    )
    get_settings.cache_clear()
    assert response.status_code == 200, response.text
    assert response.json()["reply"] == "Water during a dry week."
    assert captured["url"] == "https://assistant.test/v1/chat/completions"
    assert captured["authorization"] == "Bearer test-key"
    assert captured["json"]["model"] == "test-model"
    assert captured["json"]["messages"][-1]["content"] == "What should I water?"
    brief = captured["json"]["messages"][1]["content"]
    assert "Role: viewer" in brief
    assert "test-key" not in brief


def test_assistant_hides_the_provider_message(client, accounts, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test-key")
    monkeypatch.setenv("ASSISTANT_API_KEY", "")
    monkeypatch.setenv("CHAT_MODEL", "gemini-3.5-flash")
    get_settings.cache_clear()

    class FakeResponse:
        status_code = 402
        text = "billing"

        def json(self):
            return [{"error": {"message": "Your prepayment credits are depleted."}}]

    class FakeClient:
        def __init__(self, *args, **kwargs):
            return None

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers, json):
            return FakeResponse()

    monkeypatch.setattr("app.services.assistant.httpx.Client", FakeClient)
    response = client.post(
        "/api/v1/assistant",
        json={"messages": [{"role": "user", "content": "What should I water?"}]},
        headers=auth(accounts),
    )
    get_settings.cache_clear()
    assert response.status_code == 502, response.text
    assert response.json()["detail"] == UNAVAILABLE
    assert "prepayment" not in response.text
