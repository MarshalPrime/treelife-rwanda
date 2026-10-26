"""TreeLife Rwanda API application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core.config import get_settings
from app.domain.errors import DomainError

OPENAPI_DESCRIPTION = """
Registration API for urban and fruit trees.

TreeLife stores planting sites, individual trees, planting batches, and
lifecycle events. It is not connected to the Forestry Management and Evaluation
System (FMES). Sample records loaded by the development seed are synthetic and
are not verified field observations.

Coordinates use WGS 84 (EPSG:4326). Latitude is north-south. Longitude is east-west.
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.is_production and (
        settings.secret_key.startswith("dev-only") or len(settings.secret_key) < 32
    ):
        raise RuntimeError("Set a SECRET_KEY of at least 32 characters before production use.")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="TreeLife Rwanda API",
        version="0.1.0",
        description=OPENAPI_DESCRIPTION,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Robots-Tag"] = "noindex"
        return response

    @app.exception_handler(DomainError)
    async def domain_error_handler(_: Request, exc: DomainError):
        errors = [{"field": exc.field, "message": exc.message}] if exc.field else []
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message, "errors": errors},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError):
        errors = []
        for error in exc.errors():
            location = [
                str(part) for part in error.get("loc", []) if part not in {"body", "query", "path"}
            ]
            message = str(error.get("msg", "Invalid value"))
            prefix = "Value error, "
            if message.startswith(prefix):
                message = message[len(prefix) :]
            errors.append({"field": ".".join(location) or "request", "message": message})
        return JSONResponse(
            status_code=422,
            content={"detail": "Validation failed", "errors": errors},
        )

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {
            "name": "TreeLife Rwanda API",
            "docs": "/docs",
            "health": "/api/v1/health",
            "fmes_integration": "not_configured",
        }

    app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
