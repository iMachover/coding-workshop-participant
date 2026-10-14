"""
Department rules (ADMIN.md §2): every role may list departments; admins create and rename
them. The name is unique; the prefix is three upper-case letters, unique, and goes into new
project codes (existing codes keep the prefix they were given). Every write records an audit row.
"""

from typing import Any

import psycopg

from app.core import audit
from app.core.errors import AppError
from app.departments import repository as repo
from app.departments.schemas import Department, DepartmentCreate, DepartmentUpdate


def _validation(fields: dict[str, str]) -> AppError:
    return AppError(400, "VALIDATION_ERROR", "Request validation failed", fields)


def list_departments(conn: psycopg.Connection) -> list[Department]:
    """Every department with its people and project counts."""
    return [Department(**d) for d in repo.list_all(conn)]


def _clean_name(conn: psycopg.Connection, name: str, exclude_id: int | None = None) -> str:
    name = name.strip()
    if not name:
        raise _validation({"name": "Department name is required"})
    if repo.name_taken(conn, name, exclude_id):
        raise _validation({"name": "Another department already has this name"})
    return name


def _clean_prefix(conn: psycopg.Connection, prefix: str, exclude_id: int | None = None) -> str:
    prefix = prefix.strip().upper()
    if len(prefix) != 3 or not prefix.isalpha() or not prefix.isascii():
        raise _validation({"prefix": "Use exactly three letters, for example INF"})
    if repo.prefix_taken(conn, prefix, exclude_id):
        raise _validation({"prefix": "Another department already uses this prefix"})
    return prefix


def create_department(conn: psycopg.Connection, admin: dict[str, Any], data: DepartmentCreate) -> Department:
    """Admin creates a department."""
    name = _clean_name(conn, data.name)
    prefix = _clean_prefix(conn, data.prefix)
    department_id = repo.insert(conn, name, prefix)
    audit.record(
        conn,
        actor_id=admin["id"],
        action="created",
        entity_type="department",
        entity_id=department_id,
        entity_code=prefix,
        summary=f"Created department {name} ({prefix})",
        details={"after": {"name": name, "prefix": prefix}},
    )
    return Department(**repo.find(conn, department_id))


def update_department(conn: psycopg.Connection, admin: dict[str, Any], department_id: int, data: DepartmentUpdate) -> Department:
    """Admin renames a department or changes its prefix. Writes an audit row only when something changed."""
    current = repo.find(conn, department_id)
    if current is None:
        raise AppError(404, "NOT_FOUND", "Department not found")
    fields = data.model_dump(exclude_unset=True)
    if "name" in fields:
        fields["name"] = _clean_name(conn, fields["name"] or "", exclude_id=department_id)
    if "prefix" in fields:
        fields["prefix"] = _clean_prefix(conn, fields["prefix"] or "", exclude_id=department_id)
    before = {k: current[k] for k in fields}
    repo.update(conn, department_id, fields)
    diff = audit.changes(before, fields)
    if diff["after"]:
        audit.record(
            conn,
            actor_id=admin["id"],
            action="updated",
            entity_type="department",
            entity_id=department_id,
            entity_code=fields.get("prefix", current["prefix"]),
            summary=f"Updated department {current['name']} ({', '.join(diff['after'])})",
            details=diff,
        )
    return Department(**repo.find(conn, department_id))
