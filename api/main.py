from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api.access_routes import router as access_router
from api.admin_routes import ensure_bootstrap_admin, router as admin_router
from api.client_routes import router as client_router
from api.db import database_health

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vera")

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"
NO_STORE_HEADERS = {"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache", "Expires": "0"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_bootstrap_admin()
    except Exception:
        logger.exception("No se pudo verificar/crear el administrador inicial")
    yield


app = FastAPI(title="VERA Lubricantes", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.include_router(admin_router)
app.include_router(client_router)
app.include_router(access_router)
app.mount("/css", StaticFiles(directory=WEB_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=WEB_DIR / "js"), name="js")
app.mount("/images", StaticFiles(directory=WEB_DIR / "images"), name="images")


@app.middleware("http")
async def same_origin_guard(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin:
            origin_host = urlparse(origin).netloc
            if origin_host and origin_host != request.headers.get("host"):
                return JSONResponse(status_code=403, content={"detail": "Origen no permitido"})
    return await call_next(request)


@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok"}


@app.get("/health/db", include_in_schema=False)
def health_db():
    try:
        ok = database_health()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Base de datos no disponible") from exc
    if not ok:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Esquema VERA no disponible")
    return {"status": "ok", "database": "ok"}


@app.get("/", include_in_schema=False)
def root_app():
    return FileResponse(WEB_DIR / "admin.html", headers=NO_STORE_HEADERS)


@app.get("/admin", include_in_schema=False)
@app.get("/admin.html", include_in_schema=False)
def admin_app():
    return FileResponse(WEB_DIR / "admin.html", headers=NO_STORE_HEADERS)


@app.get("/cliente", include_in_schema=False)
@app.get("/cliente.html", include_in_schema=False)
def client_app():
    return FileResponse(WEB_DIR / "index.html", headers=NO_STORE_HEADERS)


@app.get("/activate", include_in_schema=False)
def activate_app():
    return FileResponse(WEB_DIR / "activate.html", headers=NO_STORE_HEADERS)


@app.get("/manifest.webmanifest", include_in_schema=False)
def manifest():
    return FileResponse(WEB_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js", include_in_schema=False)
def service_worker():
    return FileResponse(WEB_DIR / "sw.js", media_type="application/javascript", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.get("/icon.svg", include_in_schema=False)
def icon():
    return FileResponse(WEB_DIR / "icon.svg", media_type="image/svg+xml")


@app.get("/icon-192.png", include_in_schema=False)
def icon_192():
    return FileResponse(WEB_DIR / "icon-192.png", media_type="image/png")


@app.get("/icon-512.png", include_in_schema=False)
def icon_512():
    return FileResponse(WEB_DIR / "icon-512.png", media_type="image/png")
