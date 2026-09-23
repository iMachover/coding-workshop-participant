"""Health checks for the API and its database."""

from fastapi import APIRouter, Response, status

import db

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness check used to confirm the frontend can reach the API."""
    return {"status": "ok"}


@router.get("/health/db")
def health_db(response: Response) -> dict[str, str]:
    """Readiness check: 200 if Postgres answers, 503 if it does not."""
    if db.ping():
        return {"status": "ok", "db": "ok"}
    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "error", "db": "unavailable"}
