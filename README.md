# VERA Lubricantes

Aplicación real VERA para lubricentro. No usa sprites, screenshots ni hotspots como interfaz.

## Stack
- FastAPI
- PostgreSQL en Supabase
- HTML puro
- CSS global
- JavaScript puro
- PWA + Web Push
- Railway

## Rutas
- `/` cliente
- `/activate` activación/reset/revinculación por QR
- `/admin` administrador
- `/health` proceso web
- `/health/db` conexión con Supabase y existencia del esquema `vera`

## Base de datos
La aplicación usa las 14 tablas del esquema privado `vera` ya creadas en Supabase.

## Variables Railway
Ver `.env.example`. Ningún secreto se guarda en GitHub ni en el frontend.

## Seguridad
- Cookies HttpOnly/Secure/SameSite=Strict en producción.
- PIN de 4 dígitos protegido con Argon2 y pepper derivado de `APP_SECRET`.
- Tokens de sesión, dispositivo y QR almacenados solo como hash.
- Un dispositivo activo por cliente.
- Revincular invalida sesiones anteriores y elimina la suscripción Push anterior.
- Acceso a datos exclusivamente desde FastAPI; no se expone el esquema `vera` al navegador.
