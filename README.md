# VERA Lubricantes

Base de desarrollo de la PWA VERA Lubricantes.

## Stack aprobado

- FastAPI
- HTML puro
- CSS global
- JavaScript puro
- PostgreSQL en Supabase
- Railway para ejecución del backend

## Estructura

- `api/`: backend FastAPI.
- `api/db.py`: conexión PostgreSQL mediante `DATABASE_URL`.
- `web/`: interfaz cliente y administrador.
- `web/css/global.css`: estilos compartidos.
- `web/js/client.js`: navegación e interacción del cliente.
- `web/js/admin.js`: navegación e interacción del administrador.
- `railway.toml`: configuración de arranque y healthcheck en Railway.

La referencia visual obligatoria es el pack de imágenes aprobado para VERA. La demo anterior no forma parte de esta base de desarrollo.

## Ejecución local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload
```

Abrir `http://127.0.0.1:8000/` para cliente y `http://127.0.0.1:8000/admin.html` para administrador.

El endpoint `GET /health` está reservado para verificación de disponibilidad del servicio.

## Base de datos

La aplicación espera una única variable de entorno privada:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
```

En producción esa variable se configura en Railway. No se guarda una URL real de Supabase en GitHub, HTML o JavaScript.

El esquema inicial de Supabase crea 14 tablas privadas dentro del esquema `vera`, con RLS habilitado y sin acceso directo para `anon` ni `authenticated`. FastAPI será el punto de acceso de la aplicación a esos datos.

## Railway

`railway.toml` inicia FastAPI con:

```text
uvicorn api.main:app --host 0.0.0.0 --port $PORT
```

Railway utilizará `/health` como healthcheck. La conexión PostgreSQL quedará disponible cuando se configure `DATABASE_URL` en las variables privadas del servicio.

## Seguridad del repositorio

No subir archivos `.env`, credenciales, claves de Supabase, secretos de Railway ni ningún secreto de producción al repositorio. `.env.example` contiene únicamente un formato de ejemplo.
