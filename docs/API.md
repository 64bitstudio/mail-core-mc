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

## Salud (ticket 002)

### `GET /health`
`200` con `{"database":"ok","redis":"ok"}` si ambos responden; `503` con
el detalle de cuál falló si no.
