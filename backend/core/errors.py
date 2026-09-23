"""Domain errors raised by services. function.py maps each one to an HTTP status."""


class AppError(Exception):
    """Base class for expected errors whose message is safe to show the client."""

    def __init__(self, message: str) -> None:
        """Store the client-facing message."""
        super().__init__(message)
        self.message = message


class BadRequestError(AppError):
    """The request is well-formed but breaks a business rule."""


class UnauthorizedError(AppError):
    """The caller is not identified, or their credentials are wrong."""


class ForbiddenError(AppError):
    """The caller is signed in, but their role may not do this."""


class NotFoundError(AppError):
    """The resource does not exist, or the caller may not see it."""


class ConflictError(AppError):
    """The request conflicts with the resource's current state."""
