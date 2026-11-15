from tests.conftest import auth


def farmer_account(client, accounts):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Test Farmer",
            "email": "farmer@test.treelife.local",
            "password": "test-password-123",
            "role": "farmer",
            "district": "Gasabo",
        },
    )
    assert response.status_code == 201, response.text
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@test.treelife.local", "password": "test-password-123"},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_admin_sends_group_message_and_recipient_reads_it(client, accounts):
    sent = client.post(
        "/api/v1/messages",
        json={
            "channel": "in_app",
            "audience": "field_officer",
            "title": "New field guidance",
            "body": "Please review the latest field guidance.",
        },
        headers=auth(accounts, "admin"),
    )
    assert sent.status_code == 201, sent.text
    assert sent.json()["recipient_count"] == 1

    notifications = client.get("/api/v1/notifications", headers=auth(accounts))
    assert notifications.status_code == 200
    assert notifications.json()["unread_count"] == 1
    message_id = notifications.json()["items"][0]["message_id"]

    read = client.post(f"/api/v1/notifications/{message_id}/read", headers=auth(accounts))
    assert read.status_code == 204
    assert client.get("/api/v1/notifications", headers=auth(accounts)).json()["unread_count"] == 0

    history = client.get("/api/v1/messages", headers=auth(accounts, "admin"))
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["items"][0]["recipient_count"] == 1


def test_admin_sends_to_one_farmer_and_sms_is_not_available(client, accounts):
    farmer_headers = farmer_account(client, accounts)
    farmer = client.get("/api/v1/auth/me", headers=farmer_headers).json()

    district_message = client.post(
        "/api/v1/messages",
        json={
            "channel": "in_app",
            "audience": "farmer",
            "districts": ["Gasabo"],
            "title": "District update",
            "body": "An update for farmers in Gasabo.",
        },
        headers=auth(accounts, "admin"),
    )
    assert district_message.status_code == 201, district_message.text
    assert district_message.json()["districts"] == ["Gasabo"]
    assert district_message.json()["recipient_count"] == 1

    sent = client.post(
        "/api/v1/messages",
        json={
            "channel": "in_app",
            "audience": "individual",
            "recipient_user_ids": [farmer["id"], accounts["field_officer"]["id"]],
            "title": "Planned visit",
            "body": "A field officer plans to visit your farm.",
        },
        headers=auth(accounts, "admin"),
    )
    assert sent.status_code == 201, sent.text
    assert sent.json()["recipient_count"] == 2
    assert client.get("/api/v1/notifications", headers=farmer_headers).json()["unread_count"] == 2

    sms = client.post(
        "/api/v1/messages",
        json={
            "channel": "sms",
            "audience": "field_officer",
            "title": "SMS later",
            "body": "This must wait for SMS integration.",
        },
        headers=auth(accounts, "admin"),
    )
    assert sms.status_code == 422
    assert sms.json()["errors"][0]["field"] == "channel"


def test_non_admin_cannot_send_or_view_message_history(client, accounts):
    payload = {
        "channel": "in_app",
        "audience": "field_officer",
        "title": "Blocked",
        "body": "This should not send.",
    }
    assert client.post("/api/v1/messages", json=payload, headers=auth(accounts)).status_code == 403
    assert client.get("/api/v1/messages", headers=auth(accounts)).status_code == 403
