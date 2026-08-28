# API — mail-core-mc

Base URL local: `http://localhost:3000`. Sin autenticación todavía (se
agrega en el ticket 005 — resource server OAuth2 contra `auth-core-mc`).
Todos los endpoints devuelven/reciben JSON.

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
