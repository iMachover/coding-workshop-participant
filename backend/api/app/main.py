"""
FastAPI application factory.

The app is served by AWS Lambda through Mangum (see function.py) and by
uvicorn for local development:
    uvicorn app.main:app --reload --port 8000
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.audit.routes import router as audit_router
from app.auth.routes import router as auth_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.departments.routes import router as departments_router
from app.hours.routes import router as hours_router
from app.overview.routes import router as overview_router
from app.projects.routes import router as projects_router
from app.reports.routes import router as reports_router
from app.teams.routes import router as teams_router
from app.users.routes import router as users_router
from app.work.routes import router as work_router

logging.getLogger().setLevel(logging.INFO)


def create_app() -> FastAPI:
    """Build the application with middleware, error handlers and routers."""
    settings = get_settings()
    app = FastAPI(title="Project Tracker API", version="0.1.0", docs_url="/docs", redoc_url=None)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_error_handlers(app)

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        """Liveness probe; does not touch the database."""
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(overview_router)
    app.include_router(projects_router)
    app.include_router(work_router)
    app.include_router(teams_router)
    app.include_router(hours_router)
    app.include_router(audit_router)
    app.include_router(reports_router)
    app.include_router(departments_router)
    return app


app = create_app()
