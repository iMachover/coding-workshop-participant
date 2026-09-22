"""FastAPI app for the core service, exposed to AWS Lambda through Mangum."""

import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from config import settings

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# CloudFront forwards /api/core* to this Lambda unchanged, so every route lives under this prefix.
API_PREFIX = "/api/core"

app = FastAPI(title="Facilities Helpdesk API")

# Only needed locally (Vite :3000 -> Uvicorn :8000). In AWS the browser calls the
# same CloudFront origin, and the Function URL already has its own CORS config.
if settings.is_local:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

router = APIRouter(prefix=API_PREFIX)


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness check used to confirm the frontend can reach the API."""
    return {"status": "ok"}


app.include_router(router)

# Lambda entry point: Terraform wires Python services to function.handler.
handler = Mangum(app, lifespan="off")
