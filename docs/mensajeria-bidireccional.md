# Mensajería bidireccional VERA

Propuesta preparada sobre `main` (`a4239ce73892ca7c782be182564e1ad02ad08abb`).
Proyecto Supabase: `larailnmzlhpogvqizex`, esquema privado `vera`.
Estado: código preparado; ampliación de tabla y publicación pendientes.

## Comportamiento

- En Mensajes del administrador, el formulario de envío va arriba y el historial debajo.
- Destino: un cliente identificado por su registro o todos los clientes registrados. El envío a todos crea una fila por cliente en una transacción. Se solicita confirmación antes de enviar.
- El cliente escribe al lubricentro desde su propia sección Mensajes. Su identidad se obtiene de la sesión, nunca del formulario.
- Los mensajes nuevos usan el tipo `message`, ya existente. Las promociones y recordatorios mantienen sus tipos y relaciones.
- La lectura (`is_read`, `read_at`) pertenece exclusivamente al destinatario. Se registra cuando abre el mensaje.
- Casillas por mensaje, botón Eliminar habilitado al seleccionar y confirmación en ambas bandejas. El borrado solo registra la fecha de eliminación de ese lado y no marca el mensaje como leído.
- Inicio administrativo cuenta consultas de clientes sin leer y no eliminadas de la bandeja administrativa. El contador cliente cuenta únicamente mensajes de VERA sin leer y no eliminados de su bandeja.
- Cada cliente ve solo los mensajes asociados a su propia cuenta. Eliminar del lado cliente no impide que el lubricentro lo lea; eliminar del lado administrativo no retira la copia del cliente.
- La bandeja y sus lecturas se actualizan al abrir Mensajes o pulsar Actualizar. Inicio consulta su contador al abrirse. Esta entrega no incorpora nuevos canales ni envía Web Push para los mensajes manuales.
- Se conservan los límites existentes de 300 mensajes en administración y 200 en cliente por consulta. Actualizar permite cargar los siguientes mensajes antiguos tras eliminar los visibles. No se eliminan físicamente filas de la base.

## Ampliación de la tabla

SQL propuesto, **todavía no ejecutado**. Usar una migración remota denominada `vera_bidirectional_messages` después de la aprobación del Owner. No ejecutar `db push`: este repositorio no representa el historial completo de las 14 tablas existentes.

```sql
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table vera.messages
    add column sender_role text not null default 'admin',
    add column sender_admin_id uuid references vera.admins(id) on delete set null,
    add column admin_deleted_at timestamptz,
    add constraint messages_sender_role_check check (sender_role in ('admin', 'client')),
    add constraint messages_client_sender_check check (
        sender_role = 'admin'
        or (message_type = 'message' and sender_admin_id is null)
    );

create index messages_admin_unread_idx
    on vera.messages (created_at desc)
    where sender_role = 'client' and is_read = false and admin_deleted_at is null;

create index messages_sender_admin_idx
    on vera.messages (sender_admin_id)
    where sender_admin_id is not null;
```

Los registros existentes reciben `sender_role='admin'`, coherente con su origen. Se mantienen contenidos, identificadores, fechas, lectura, relaciones e índices previos. No se inventa el administrador autor de mensajes históricos: `sender_admin_id` permanece nulo en ellos. Los nuevos envíos manuales administrativos guardan su autor y se registran en `vera.admin_activity`.

La ampliación no concede permisos ni expone `vera` al Data API. Se conserva RLS y el acceso a través del backend con las sesiones existentes.

## Recursos y operaciones

| Recurso | Cambio |
| --- | --- |
| `api/models.py` | Validación de texto, destinatario y selección de UUID; rechaza campos extra. |
| `api/admin_routes.py` | Envío, lectura recibida, eliminación propia, listado por dirección y contador. |
| `api/client_routes.py` | Envío desde sesión, eliminación múltiple propia, filtro de lectura y contador. |
| `web/admin.html`, `web/js/admin.js` | Formulario, destinatario, historial desplegable, respuesta y selección. |
| `web/index.html`, `web/js/client.js` | Formulario, mensajes enviados/recibidos, respuesta y selección. |
| `web/css/messages.css` | Estilos de controles y tarjetas, con adaptación móvil. |
| `web/sw.js` | Nueva versión de caché y hoja de estilos; no almacena respuestas de mensajes. |

Se agregan `POST /api/admin/messages`, `POST /api/admin/messages/{message_id}/read`, `DELETE /api/admin/messages`, `POST /api/client/messages` y `DELETE /api/client/messages`. Se conservan los endpoints de listado, lectura y eliminación individual que ya existían. Todo endpoint nuevo exige la dependencia de sesión del rol correspondiente.

## Publicación controlada

1. Aprobar la ampliación descrita y su integración/publicación.
2. Aplicar el SQL con `apply_migration` al proyecto indicado. El límite de espera del bloqueo evita quedar esperando indefinidamente. Si falla, no integrar el código.
3. Comprobar por consultas de solo lectura las nuevas columnas, restricciones, índices y conservación del total de mensajes; revisar los avisos de seguridad.
4. Integrar la propuesta en `main`, verificar el SHA y esperar `SUCCESS` en Railway para ese commit.
5. Verificar los recursos servidos y revisar manualmente las pantallas de administrador y cliente con sesiones legítimas, incluyendo móvil. Validar envío/lectura/eliminación únicamente con una cuenta y mensajes expresamente autorizados para esa comprobación.

Riesgos: el código nuevo requiere la ampliación antes de desplegarse; desplegarlo primero causaría errores de columnas inexistentes. `ALTER TABLE` requiere un bloqueo breve. Los mensajes guardados por esta función no deben perderse si se necesita una corrección; no revertir eliminando las columnas.

## Verificación realizada y pendiente

- Acceso confirmado al proyecto activo y a sus 14 tablas en `vera`.
- Inspeccionadas columnas, restricciones, índices, permisos y tipos reales de `vera.messages`; revisadas también las restricciones de `vera.admin_activity`.
- Inspección de diferencias de código, condiciones de autorización, alcance por cliente, navegación y referencias de recursos. Análisis de sintaxis de los tres archivos Python y los tres JavaScript modificados, sin ejecutarlos.
- Sin Pytest, mocks, pruebas automáticas ni mensajes de prueba en producción.
- Pendientes: aplicación de la ampliación, persistencia mediante el flujo real, revisión visual autenticada/responsive y publicación.
