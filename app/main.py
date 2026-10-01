from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.auth import router as auth_router
from app.routers.team import router as team_router
from app.routers.event import router as event_router
from app.routers.leaderboard import router as leaderboard_router
from app.routers.submissions import router as submissions_router
from app.routers.admin import router as admin_router


def create_app() -> FastAPI:
    app = FastAPI(title="Quant Challenge API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().allowed_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(team_router, prefix="/api/v1")
    app.include_router(event_router, prefix="/api/v1")
    app.include_router(leaderboard_router, prefix="/api/v1")
    app.include_router(submissions_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
