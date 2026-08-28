# API — mail-core-mc

Base URL local: `http://localhost:3000`. Todos los endpoints devuelven/reciben JSON.

## Autenticación (ticket 005)

`mail-core-mc` es un *resource server* OAuth2 — valida JWTs emitidos por
`auth-core-mc` contra su JWK Set (`{AUTH_CORE_MC_ISSUER_URI}/oauth2/jwks`),
sin base de credenciales propia. Obtén un token con `client_credentials`
contra `auth-core-mc` (ver su `docs/API.md`, sección "client_credentials"):

```
POST {AUTH_CORE_MC_ISSUER_URI}/oauth2/token
Authorization: Basic base64(client_id:client_secret)

grant_type=client_credentials&scope=mail:send
```

Y mándalo en cada request a `mail-core-mc`:
```
Authorization: Bearer <access_token>
```

- Sin token, o token inválido/expirado/de un `client_id` no reconocido por el JWK Set → `401`.
- Token válido pero sin el scope que el endpoint requiere → `403`.

Las plantillas (`/v1/templates/**`, ticket 003) **todavía no están
protegidas** — quedan fuera de alcance del ticket 005, pendientes de
envolverse con el mismo mecanismo en un ticket futuro.

## Envío transaccional (ticket 005, HU-1/HU-6)

Requiere `Authorization: Bearer <token>` con scope `mail:send`.

### `POST /v1/emails`
Renderiza la plantilla con las variables dadas y encola el envío real
(ticket 004) — el llamante nunca ve el HTML final, solo el resultado.

**Body:**
```json
{
  "templateId": "682f6d5a-...",
  "to": "usuario@ejemplo.com",
  "variables": { "nombre": "Marco" },
  "tenantId": "acme"
}
```
`tenantId` es opcional — el tenant de negocio del llamante (ej. el
tenant de `auth-core-mc` que originó la acción), string libre, no
validado contra `auth-core-mc` todavía (identidad de remitente por
tenant es Fase 2). Si se omite, se usa un tenant compartido del
ecosistema.

**Respuesta `202`:** `{ "messageId": "...", "status": "queued" }`, o
`{ "messageId": "...", "status": "suppressed" }` si el destinatario está
en la lista de supresión (ticket 006) — en ese caso **no se encola nada**.

**`400`** si `templateId` no existe, o si faltan variables que la
plantilla requiere (mismo error que `/v1/templates/:id/render`, ver
arriba) — nunca se encola un envío a medias.

### `GET /v1/emails/:id`
Consulta el estado de un mensaje ya encolado: `queued` → `sent`/`failed`
(worker, ticket 004) → `bounced` si llega un bounce permanente después
(ticket 006, ver `lastError` para el diagnóstico); `suppressed` si nunca
llegó a encolarse. `404` si el `id` no existe.

## Plantillas (ticket 003, HU-2)

### `POST /v1/templates`
Crea una plantilla. `htmlBody`/`subject` pueden usar variables planas
`{{variable}}` (sin bloques `{{#each}}`/`{{#if}}` — ver limitación en
`docs/definiciones/mail-core-mc-v1.md`).

**Body:**
```json
{ "name": "bienvenida", "subject": "Hola {{nombre}}", "htmlBody": "<p>Hola {{nombre}}</p>", "tenantId": null }
```
**Respuesta `201`:** la plantilla creada, con `id` y `version: 1`.

### `GET /v1/templates/:id`
Devuelve la plantilla. `404` si no existe.

### `PATCH /v1/templates/:id`
Actualiza uno o más campos (`name`/`subject`/`htmlBody`) — **siempre
incrementa `version`**, no hay actualización parcial "silenciosa" sin
subir versión.

### `POST /v1/templates/:id/render`
Renderiza la plantilla con las variables dadas — endpoint de
conveniencia para probarla sin pasar por el flujo de envío real (eso es
el ticket 005, que reutiliza el mismo `TemplatesService.render()`).

**Body:**
```json
{ "variables": { "nombre": "Marco", "link": "https://..." } }
```
**Respuesta `200`:** `{ "subject": "...", "html": "..." }` ya renderizado.

**Respuesta `400`** si falta alguna variable que la plantilla requiere:
```json
{ "statusCode": 400, "error": "Bad Request", "message": "Faltan variables requeridas por la plantilla: link", "missingVariables": ["link"] }
```

## Webhooks de estado de entrega (ticket 007)

Requiere `Authorization: Bearer <token>` con scope `mail:send` (se
reutiliza el mismo scope por ahora — no hay un `mail:admin` separado
todavía; si en el futuro se necesita separar quién puede *enviar*
correos de quién puede *administrar* la configuración del tenant, valdría
la pena revisarlo, pero no bloquea este ticket).

### `POST /v1/webhooks`
Registra (o rota, si ya existía uno) la URL de callback del tenant que
llama. Un tenant tiene como máximo un webhook activo — volver a
registrar sobre el mismo tenant **reemplaza** la URL y **rota el
secret** (el anterior deja de ser válido de inmediato).

**Body:**
```json
{ "url": "https://tu-app.com/webhooks/mail-core-mc", "tenantId": "acme" }
```
`tenantId` es opcional (usa el tenant compartido por defecto si se
omite, igual que en `POST /v1/emails`).

**Respuesta `201`:**
```json
{ "url": "https://tu-app.com/webhooks/mail-core-mc", "secret": "…64 hex chars…" }
```
El `secret` **solo se muestra en esta respuesta** — guárdalo, no hay
forma de recuperarlo después (solo de rotarlo volviendo a registrar).

### Payload que recibe tu endpoint
Por cada cambio de estado relevante de un mensaje (`sent`, `failed`,
`bounced`, `complained`) se hace un `POST` a la URL registrada:

```json
{
  "messageId": "968ba768-2107-42ac-9615-589df64c9674",
  "event": "bounced",
  "recipientEmail": "buzon-inexistente@ejemplo.com",
  "status": "bounced",
  "lastError": "smtp; 550 5.1.1 <buzon-inexistente@ejemplo.com>",
  "occurredAt": "2026-08-28T02:46:09.343Z"
}
```

Firmado con `X-Signature: sha256=<hex>` — HMAC-SHA256 del cuerpo exacto
(JSON tal cual se envía) usando el `secret` devuelto al registrar.
Verifícalo así (ejemplo Node):
```js
const crypto = require('crypto');
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
// compara expected con el header X-Signature (constant-time)
```

**Reintentos (AC2):** un 5xx o error de red/timeout del receptor se
reintenta con backoff exponencial (`WEBHOOK_MAX_ATTEMPTS`/
`WEBHOOK_BACKOFF_DELAY_MS`, mismo mecanismo que la cola transaccional).
Un 4xx se trata como error permanente del receptor — no se reintenta.
Si un tenant no tiene webhook registrado, el evento simplemente no se
dispara (no es un error).

Verificado en vivo end-to-end (ticket 007): registro real contra un
receptor HTTP local, envío real de un correo (evento `sent` con firma
válida), y un bounce real generado por Postfix (`550 5.1.1`, DSN
parseado por `MaildirWatcherService`/`BounceProcessorService`, evento
`bounced` con firma válida) — ambas firmas verificadas por HMAC contra
el secret devuelto por el registro.

## Salud (ticket 002)

### `GET /health`
`200` con `{"database":"ok","redis":"ok"}` si ambos responden; `503` con
el detalle de cuál falló si no.
