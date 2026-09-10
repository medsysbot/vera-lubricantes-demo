from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"

app = FastAPI(title="VERA Lubricantes")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
