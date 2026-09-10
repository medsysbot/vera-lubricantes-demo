import os

import psycopg
from psycopg.rows import dict_row


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL no esta configurada")
    return database_url


def open_database_connection():
    return psycopg.connect(
        get_database_url(),
        row_factory=dict_row,
        connect_timeout=10,
    )
