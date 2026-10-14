"""
AWS Lambda entry point.

Terraform deploys every backend/<service>/ folder as one Lambda with handler
`function.handler`. Mangum adapts the Lambda Function URL event to ASGI.

Path handling: CloudFront forwards requests untouched, so in the cloud the
path arrives as /api/api/auth/login (the service is named `api`). The local
proxy (bin/proxy-server.js) strips that prefix, so locally it arrives as
/auth/login. The prefix is removed here so routes are defined once.
"""

import logging
from typing import Any

from mangum import Mangum

from app.main import app

logger = logging.getLogger()
logger.setLevel(logging.INFO)

API_PREFIX = "/api/api"

_asgi_handler = Mangum(app, lifespan="off")


def _strip_prefix(event: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of the event with the CloudFront route prefix removed."""
    raw_path = event.get("rawPath") or ""
    if not raw_path.startswith(API_PREFIX):
        return event
    new_path = raw_path[len(API_PREFIX):] or "/"
    patched = {**event, "rawPath": new_path}
    http = (event.get("requestContext") or {}).get("http")
    if http:
        patched["requestContext"] = {
            **event["requestContext"],
            "http": {**http, "path": new_path},
        }
    return patched


def handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    """Lambda handler: normalise the path, then hand off to FastAPI."""
    return _asgi_handler(_strip_prefix(event), context)
