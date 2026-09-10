from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.config import Settings
from api.db import database_health

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"

app = FastAPI(title="VERA Lubricantes")

app.mount("/css", StaticFiles(directory=WEB_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=WEB_DIR / "js"), name="js")


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    try:
        settings = Settings.from_env()
        database_health(settings)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio no disponible",
        ) from exc

    return {"status": "ok", "database": "ok"}


@app.get("/", include_in_schema=False)
def client_app() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/admin.html", include_in_schema=False)
def admin_app() -> FileResponse:
    return FileResponse(WEB_DIR / "admin.html")
