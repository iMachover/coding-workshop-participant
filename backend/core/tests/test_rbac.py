"""Who may call what: sign-in is required everywhere but a few public routes, and
/tickets is for employees only, /admin for Facility Admins only, /engineer for engineers only."""

import pytest

from deps import ACCESS_DENIED, MISSING_TOKEN
from function import API_PREFIX, app
from tests.conftest import bearer

PUBLIC = {
    ("GET", "/health"),
    ("GET", "/health/db"),
    ("POST", "/auth/register"),
    ("POST", "/auth/login"),
}

# Every route the app serves, read from its OpenAPI schema so new routes are covered
# without editing this list. Path ids become 1, which is enough to reach the auth check.
ALL_ROUTES = sorted(
    (method.upper(), path.removeprefix(API_PREFIX))
    for path, operations in app.openapi()["paths"].items()
    for method in operations
)
PROTECTED = [route for route in ALL_ROUTES if route not in PUBLIC]

EMPLOYEE_ONLY = [
    ("GET", "/tickets", None),
    ("POST", "/tickets", {}),
    ("GET", "/tickets/{ticket_id}", None),
    ("GET", "/tickets/{ticket_id}/history", None),
    ("GET", "/tickets/{ticket_id}/notes", None),
    ("POST", "/tickets/{ticket_id}/notes", {"note_text": "hello"}),
    ("POST", "/tickets/{ticket_id}/escalation", {"reason": "please"}),
]

ADMIN_ONLY = [
    ("GET", "/admin/tickets", None),
    ("GET", "/admin/tickets/{ticket_id}", None),
    ("GET", "/admin/tickets/{ticket_id}/notes", None),
    ("GET", "/admin/tickets/{ticket_id}/history", None),
    ("PUT", "/admin/tickets/{ticket_id}/assignment", {"engineer_id": 1}),
    ("POST", "/admin/tickets/{ticket_id}/status", {"status": "closed"}),
    ("GET", "/admin/metrics", None),
    ("GET", "/admin/engineers", None),
    ("GET", "/admin/users", None),
    ("PUT", "/admin/users/{user_id}/role", {"role": "engineer"}),
    ("GET", "/admin/facilities", None),
    ("POST", "/admin/buildings", {"building_name": "Annex"}),
    ("PATCH", "/admin/buildings/{building_id}", {"is_active": False}),
    ("DELETE", "/admin/buildings/{building_id}", None),
    ("POST", "/admin/buildings/{building_id}/floors", {"floor_number": 9}),
    ("PATCH", "/admin/floors/{floor_id}", {"is_active": False}),
    ("DELETE", "/admin/floors/{floor_id}", None),
    ("POST", "/admin/floors/{floor_id}/seats", {"seat_number": "999"}),
    ("PATCH", "/admin/seats/{seat_id}", {"is_active": False}),
    ("DELETE", "/admin/seats/{seat_id}", None),
]

ENGINEER_ONLY = [
    ("GET", "/engineer/tickets", None),
    ("GET", "/engineer/tickets/{ticket_id}", None),
    ("GET", "/engineer/tickets/{ticket_id}/history", None),
    ("GET", "/engineer/tickets/{ticket_id}/notes", None),
    ("POST", "/engineer/tickets/{ticket_id}/notes", {"note_text": "hello"}),
    ("POST", "/engineer/tickets/{ticket_id}/status", {"status": "in_progress"}),
]


def _url(path: str, ticket_id: int = 1) -> str:
    return API_PREFIX + (
        path.replace("{ticket_id}", str(ticket_id))
        .replace("{building_id}", "1")
        .replace("{floor_id}", "1")
        .replace("{seat_id}", "1")
        .replace("{user_id}", "1")
    )


def test_the_public_list_matches_real_routes() -> None:
    assert PUBLIC <= set(ALL_ROUTES)
    assert {(m, p) for m, p, _ in EMPLOYEE_ONLY} == {r for r in ALL_ROUTES if r[1].startswith("/tickets")}
    assert {(m, p) for m, p, _ in ADMIN_ONLY} == {r for r in ALL_ROUTES if r[1].startswith("/admin")}
    assert {(m, p) for m, p, _ in ENGINEER_ONLY} == {r for r in ALL_ROUTES if r[1].startswith("/engineer")}


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_every_other_route_requires_sign_in(client, method, path) -> None:
    response = client.request(method, _url(path), json={})
    assert response.status_code == 401
    assert response.json() == {"detail": MISSING_TOKEN}


@pytest.mark.parametrize("role", ["engineer", "admin"])
@pytest.mark.parametrize(("method", "path", "body"), EMPLOYEE_ONLY)
def test_ticket_routes_are_employee_only(
    client, user_with_role, create_ticket, jane, role, method, path, body
) -> None:
    # A real ticket, so a 403 can't be mistaken for "not found".
    ticket = create_ticket(jane)
    response = client.request(
        method, _url(path, ticket["ticket_id"]), json=body, headers=bearer(user_with_role(role))
    )
    assert response.status_code == 403
    assert response.json() == {"detail": ACCESS_DENIED}


@pytest.mark.parametrize("role", ["employee", "engineer"])
@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ONLY)
def test_admin_routes_are_admin_only(
    client, user_with_role, create_ticket, jane, role, method, path, body
) -> None:
    ticket = create_ticket(jane)
    response = client.request(
        method, _url(path, ticket["ticket_id"]), json=body, headers=bearer(user_with_role(role))
    )
    assert response.status_code == 403
    assert response.json() == {"detail": ACCESS_DENIED}


@pytest.mark.parametrize("role", ["employee", "admin"])
@pytest.mark.parametrize(("method", "path", "body"), ENGINEER_ONLY)
def test_engineer_routes_are_engineer_only(
    client, user_with_role, create_ticket, jane, role, method, path, body
) -> None:
    ticket = create_ticket(jane)
    response = client.request(
        method, _url(path, ticket["ticket_id"]), json=body, headers=bearer(user_with_role(role))
    )
    assert response.status_code == 403
    assert response.json() == {"detail": ACCESS_DENIED}


@pytest.mark.parametrize("role", ["employee", "engineer", "admin"])
@pytest.mark.parametrize("path", ["/auth/me", "/buildings", "/buildings/{building_id}/floors"])
def test_any_signed_in_role_can_use_shared_routes(client, user_with_role, loc, role, path) -> None:
    url = API_PREFIX + path.replace("{building_id}", str(loc["A"]))
    response = client.get(url, headers=bearer(user_with_role(role)))
    assert response.status_code == 200
