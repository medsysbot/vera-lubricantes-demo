# VERA Lubricantes

Base de desarrollo de la PWA VERA Lubricantes.

## Stack aprobado

- FastAPI
- HTML puro
- CSS global
- JavaScript puro

## Estructura

- `api/`: backend FastAPI.
- `web/`: interfaz cliente y administrador.
- `web/css/global.css`: estilos compartidos.
- `web/js/client.js`: navegación e interacción del cliente.
- `web/js/admin.js`: navegación e interacción del administrador.

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

## Seguridad del repositorio

No subir archivos `.env`, credenciales, claves de Supabase, secretos de Railway ni ningún secreto de producción al repositorio. Las credenciales se configurarán mediante variables de entorno cuando se conecten Supabase y Railway.
