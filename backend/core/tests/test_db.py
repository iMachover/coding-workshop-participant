"""Connection reuse, transactions and recovery in db.py."""

import psycopg
import pytest

import db


def _building_names(run_sql) -> set[str]:
    return {row["building_name"] for row in run_sql("SELECT building_name FROM buildings")}


def test_transaction_commits_on_success(run_sql) -> None:
    with db.transaction() as conn:
        conn.execute("INSERT INTO buildings (building_name) VALUES ('Committed')")
    assert "Committed" in _building_names(run_sql)
    run_sql("DELETE FROM buildings WHERE building_name = 'Committed'")


def test_transaction_rolls_back_on_error(run_sql) -> None:
    with pytest.raises(RuntimeError), db.transaction() as conn:
        conn.execute("INSERT INTO buildings (building_name) VALUES ('Rolled back')")
        raise RuntimeError("boom")
    assert "Rolled back" not in _building_names(run_sql)


def test_connection_is_reused_between_transactions() -> None:
    with db.transaction() as first:
        pass
    with db.transaction() as second:
        pass
    assert first is second


def test_reconnects_after_the_server_drops_the_connection() -> None:
    with pytest.raises(psycopg.OperationalError), db.transaction() as conn:
        conn.execute("SELECT pg_terminate_backend(pg_backend_pid())")
    assert db._conn is None
    assert db.ping()


def test_ping_is_false_when_the_database_is_unreachable(monkeypatch) -> None:
    def refuse() -> None:
        raise psycopg.OperationalError("connection refused")

    monkeypatch.setattr(db, "_conn", None)
    monkeypatch.setattr(db, "_connect", refuse)
    assert db.ping() is False
