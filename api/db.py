from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg import Connection
from psycopg.rows import dict_row

from api.config import settings


@contextmanager
def connection() -> Iterator[Connection]:
    conn = psycopg.connect(
        settings.require_database(),
        row_factory=dict_row,
        connect_timeout=10,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def database_health() -> bool:
    with connection() as conn:
        row = conn.execute("select to_regclass('vera.clients') as clients_table").fetchone()
        return bool(row and row["clients_table"])
