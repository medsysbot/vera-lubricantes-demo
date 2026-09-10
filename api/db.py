from __future__ import annotations

import psycopg
from psycopg import Connection
from psycopg.rows import dict_row

from api.config import Settings


def open_database_connection(settings: Settings) -> Connection:
    return psycopg.connect(
        settings.database_url,
        row_factory=dict_row,
        connect_timeout=10,
    )


def database_health(settings: Settings) -> None:
    with open_database_connection(settings) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "select to_regclass('vera.clients') as clients_table, "
                "to_regclass('vera.vehicles') as vehicles_table, "
                "to_regclass('vera.services') as services_table"
            )
            row = cursor.fetchone()

    if not row or not all(row.values()):
        raise RuntimeError("El esquema vera no esta disponible")
