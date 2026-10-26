class DomainError(Exception):
    """A request that is well-formed JSON but not acceptable as a record."""

    def __init__(self, message: str, status_code: int = 422, field: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.field = field
