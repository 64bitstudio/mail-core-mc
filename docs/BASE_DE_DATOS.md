# Base de datos — mail-core-mc

PostgreSQL, gestionado con Prisma (`backend/prisma/schema.prisma`,
migraciones versionadas en `backend/prisma/migrations/`). Ver
`docs/definiciones/mail-core-mc-v1.md` para el modelo completo planeado
(incluye Contact/List/Segment/Campaign de la Fase 3, aún no creadas).

## Tablas (ticket 002 — base de la Fase 1)

### `tenants`
Identidad de remitente por tenant (Fase 2, HU-8 — los campos ya existen
en el esquema pero no se usan hasta entonces; mientras tanto todo tenant
envía con el remitente por defecto del ecosistema).

| Campo | Para qué es |
|---|---|
| `id` | UUID, PK |
| `name` | Nombre del tenant |
| `from_display_name` | Nombre de remitente a mostrar (nullable hasta Fase 2) |
| `reply_to` | Reply-to del tenant (nullable hasta Fase 2) |
| `brand_color` | Branding del tenant (nullable hasta Fase 2) |
| `created_at` | — |

### `templates`
Plantillas HTML con variables (HU-2). `tenant_id` nulo = plantilla
compartida/del sistema.

| Campo | Para qué es |
|---|---|
| `id` | UUID, PK |
| `tenant_id` | FK a `tenants`, nullable |
| `name` | Nombre interno de la plantilla |
| `subject` | Asunto (puede tener variables) |
| `html_body` | HTML con placeholders `{{variable}}` |
| `version` | Se incrementa en cada actualización |
| `created_at`, `updated_at` | — |

### `messages`
Un registro por correo individual enviado (transaccional o, en Fase 3,
de campaña). `status` es un string libre (no enum) a propósito: HU-3/HU-4
van agregando estados (`queued`, `sent`, `delivered`, `bounced`,
`failed`, `suppressed`) y un enum hubiera forzado una migración por cada
estado nuevo — la validación de valores válidos vive en la capa de
aplicación (ticket 005), no en la base de datos.

| Campo | Para qué es |
|---|---|
| `id` | UUID, PK |
| `tenant_id` | FK a `tenants` |
| `template_id` | FK a `templates`, nullable |
| `type` | `transactional` \| `marketing` (enum real, cerrado a propósito — a diferencia de `status`, este valor no cambia después de creado el mensaje) |
| `status` | Ver nota arriba |
| `recipient_email` | Destinatario |
| `rendered_subject` | Asunto ya renderizado (auditoría — qué se mandó de verdad) |
| `provider_message_id` | ID interno del envío (para correlacionar con logs de Postfix) |
| `created_at`, `sent_at`, `last_status_at` | — |

### `suppression_entries`
Lista de supresión (HU-4). `tenant_id` nulo = supresión global (un hard
bounce o complaint aplica a cualquier tenant, no solo al que lo originó).

| Campo | Para qué es |
|---|---|
| `id` | UUID, PK |
| `email` | Dirección suprimida |
| `reason` | `bounce` \| `complaint` \| `unsubscribe` |
| `tenant_id` | FK a `tenants`, nullable (ver nota arriba) |
| `created_at` | — |

Único por `(email, tenant_id)` — el mismo correo puede estar suprimido
globalmente y, por separado, también aparecer con una entrada específica
de un tenant si aplica.
