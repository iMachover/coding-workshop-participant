"""
FastAPI application factory.

The app is served by AWS Lambda through Mangum (see function.py) and by
uvicorn for local development:
    uvicorn app.main:app --reload --port 8000
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.routes import router as auth_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.users.routes import router as users_router

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
    return app


app = create_app()
