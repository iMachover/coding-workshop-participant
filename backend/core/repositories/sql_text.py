"""Helpers for building SQL parameters (never SQL text) shared by the repositories."""


def like_pattern(text: str) -> str:
    """Wrap text for a 'contains' ILIKE, escaping % and _ so they match literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
