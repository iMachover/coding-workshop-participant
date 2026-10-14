"""Tests for the Lambda entry point and its path normalisation."""

import json

import function


def _function_url_event(path: str, method: str = "GET") -> dict:
    """Build a minimal Lambda Function URL (payload v2) event."""
    return {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": path,
        "rawQueryString": "",
        "headers": {"host": "example.lambda-url.us-east-1.on.aws", "accept": "application/json"},
        "requestContext": {
            "http": {"method": method, "path": path, "protocol": "HTTP/1.1", "sourceIp": "127.0.0.1", "userAgent": "pytest"},
            "requestId": "test",
            "stage": "$default",
        },
        "isBase64Encoded": False,
    }


def test_strip_prefix_removes_cloudfront_route():
    event = function._strip_prefix(_function_url_event("/api/api/auth/login"))
    assert event["rawPath"] == "/auth/login"
    assert event["requestContext"]["http"]["path"] == "/auth/login"


def test_strip_prefix_leaves_local_paths_alone():
    event = _function_url_event("/auth/login")
    assert function._strip_prefix(event) is event


def test_strip_prefix_bare_prefix_becomes_root():
    assert function._strip_prefix(_function_url_event("/api/api"))["rawPath"] == "/"


def test_handler_serves_health_with_and_without_prefix():
    for path in ("/health", "/api/api/health"):
        response = function.handler(_function_url_event(path), None)
        assert response["statusCode"] == 200, path
        assert json.loads(response["body"]) == {"status": "ok"}


def test_handler_returns_error_envelope_for_unauthenticated_me():
    response = function.handler(_function_url_event("/api/api/me"), None)
    assert response["statusCode"] == 401
    assert json.loads(response["body"])["error"]["code"] == "UNAUTHORIZED"
