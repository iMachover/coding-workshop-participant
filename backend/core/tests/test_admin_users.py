"""Facility Admins listing people and moving them between the employee and engineer roles."""

import pytest

from services.auth_service import ROLE_CHANGED
from tests.conftest import bearer


def _users(client, api, admin, **params) -> list[dict]:
    response = client.get(f"{api}/admin/users", headers=admin, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _change(client, api, admin, user_id, role):
    return client.put(f"{api}/admin/users/{user_id}/role", json={"role": role}, headers=admin)


def _engineer_names(client, api, admin) -> list[str]:
    return [e["full_name"] for e in client.get(f"{api}/admin/engineers", headers=admin).json()]


def _role_of(run_sql, user_id) -> str:
    rows = run_sql(
        "SELECT r.role_name FROM users u JOIN roles r USING (role_id) WHERE u.user_id = %s", (user_id,)
    )
    return rows[0]["role_name"]


def _admin_id(run_sql) -> int:
    return run_sql("SELECT user_id FROM users WHERE email = 'admin@acme.inc'")[0]["user_id"]


def _give_active_tickets(run_sql, create_ticket, headers, engineer_id, statuses) -> None:
    for status in statuses:
        ticket_id = create_ticket(headers)["ticket_id"]
        run_sql(
            "UPDATE tickets SET status = %s, assigned_to_user_id = %s WHERE ticket_id = %s",
            (status, engineer_id, ticket_id),
        )


# --- list -----------------------------------------------------------------------


def test_lists_everyone_by_name_with_role_and_active_tickets(
    client, api, admin, jane_user, eve_user, engineers, jane, create_ticket, run_sql
) -> None:
    _give_active_tickets(run_sql, create_ticket, jane, engineers["sam"], ["open", "blocked", "closed"])

    users = _users(client, api, admin)

    assert [(u["full_name"], u["role"], u["active_ticket_count"]) for u in users] == [
        ("Eve Other", "employee", 0),
        ("Jane Doe", "employee", 0),
        ("Kim Fixit", "engineer", 0),
        ("Sam Tech", "engineer", 2),
        ("Test Admin", "admin", 0),
    ]
    assert set(users[0]) == {
        "user_id", "email", "full_name", "phone_number", "role", "created_at", "active_ticket_count",
    }


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"role": "engineer"}, ["Kim Fixit", "Sam Tech"]),
        ({"role": "employee"}, ["Eve Other", "Jane Doe"]),
        ({"role": "admin"}, ["Test Admin"]),
        ({"q": "JANE"}, ["Jane Doe"]),
        ({"q": "kim@acme"}, ["Kim Fixit"]),
        ({"q": "%"}, []),
        ({"q": "e", "role": "engineer"}, ["Kim Fixit", "Sam Tech"]),
        ({"q": "nobody"}, []),
    ],
)
def test_list_filters(client, api, admin, jane_user, eve_user, engineers, params, expected) -> None:
    assert [u["full_name"] for u in _users(client, api, admin, **params)] == expected


@pytest.mark.parametrize("params", [{"role": "boss"}, {"q": "x" * 101}, {"unknown": "x"}])
def test_list_rejects_unknown_filter_values(client, api, admin, params) -> None:
    assert client.get(f"{api}/admin/users", headers=admin, params=params).status_code == 422


# --- change role ------------------------------------------------------------------


def test_promoting_an_employee_makes_them_assignable_and_signs_them_out(
    client, api, admin, jane, jane_user, eve, create_ticket
) -> None:
    response = _change(client, api, admin, jane_user["user_id"], "engineer")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user_id"] == jane_user["user_id"]
    assert (body["role"], body["active_ticket_count"]) == ("engineer", 0)
    assert "password_hash" not in body

    # Her old employee token no longer works: she has to sign in again as an engineer.
    old_token = client.get(f"{api}/auth/me", headers=jane)
    assert old_token.status_code == 401
    assert old_token.json() == {"detail": ROLE_CHANGED}
    new_token = bearer({**jane_user, "role": "engineer"})
    assert client.get(f"{api}/auth/me", headers=new_token).json()["role"] == "engineer"

    ticket = create_ticket(eve)
    assigned = client.put(
        f"{api}/admin/tickets/{ticket['ticket_id']}/assignment",
        json={"engineer_id": jane_user["user_id"]},
        headers=admin,
    )
    assert assigned.status_code == 200
    assert _engineer_names(client, api, admin) == ["Jane Doe"]


def test_an_engineer_without_active_tickets_can_go_back_to_employee(
    client, api, admin, engineers, jane, create_ticket, run_sql
) -> None:
    # Finished work doesn't count.
    _give_active_tickets(run_sql, create_ticket, jane, engineers["kim"], ["resolved", "closed"])

    response = _change(client, api, admin, engineers["kim"], "employee")

    assert response.status_code == 200
    assert response.json()["role"] == "employee"
    assert _engineer_names(client, api, admin) == ["Sam Tech"]


@pytest.mark.parametrize(
    ("statuses", "message"),
    [
        (["in_progress"], "Sam Tech still has 1 active ticket. Reassign them first."),
        (["open", "blocked", "in_progress"], "Sam Tech still has 3 active tickets. Reassign them first."),
    ],
)
def test_an_engineer_with_active_tickets_cannot_be_demoted(
    client, api, admin, engineers, jane, create_ticket, run_sql, statuses, message
) -> None:
    _give_active_tickets(run_sql, create_ticket, jane, engineers["sam"], statuses)

    response = _change(client, api, admin, engineers["sam"], "employee")

    assert response.status_code == 409
    assert response.json() == {"detail": message}
    assert _role_of(run_sql, engineers["sam"]) == "engineer"


@pytest.mark.parametrize(
    ("who", "role", "message"),
    [
        ("jane", "employee", "Jane Doe is already an employee"),
        ("sam", "engineer", "Sam Tech is already an engineer"),
    ],
)
def test_the_same_role_again_is_a_conflict(
    client, api, admin, jane_user, engineers, who, role, message
) -> None:
    user_id = jane_user["user_id"] if who == "jane" else engineers["sam"]
    response = _change(client, api, admin, user_id, role)
    assert response.status_code == 409
    assert response.json() == {"detail": message}


@pytest.mark.parametrize("role", ["employee", "engineer"])
def test_admin_accounts_cannot_be_changed_including_your_own(client, api, admin, run_sql, role) -> None:
    response = _change(client, api, admin, _admin_id(run_sql), role)
    assert response.status_code == 403
    assert response.json() == {"detail": "Admin accounts can't be changed here"}


@pytest.mark.parametrize("body", [{"role": "admin"}, {"role": "boss"}, {}, {"role": None}])
def test_only_employee_or_engineer_can_be_given(client, api, admin, jane_user, run_sql, body) -> None:
    response = client.put(f"{api}/admin/users/{jane_user['user_id']}/role", json=body, headers=admin)
    assert response.status_code == 422
    assert _role_of(run_sql, jane_user["user_id"]) == "employee"


def test_changing_a_missing_user(client, api, admin) -> None:
    response = _change(client, api, admin, 999, "engineer")
    assert response.status_code == 404
    assert response.json() == {"detail": "User not found"}


@pytest.mark.parametrize("user_id", ["0", "abc", "2147483648"])
def test_change_rejects_bad_ids(client, api, admin, user_id) -> None:
    assert _change(client, api, admin, user_id, "engineer").status_code == 422


def test_the_active_ticket_rule_only_applies_to_engineers(
    client, api, admin, jane_user, eve, create_ticket, run_sql
) -> None:
    # Old data: a ticket still pointing at someone who is an employee now.
    _give_active_tickets(run_sql, create_ticket, eve, jane_user["user_id"], ["open"])

    response = _change(client, api, admin, jane_user["user_id"], "engineer")

    assert response.status_code == 200
    assert response.json()["active_ticket_count"] == 1
