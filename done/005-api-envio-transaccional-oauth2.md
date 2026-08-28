# 005 — API de envío transaccional + autenticación OAuth2

## Objetivo
Exponer el endpoint público que las apps del ecosistema (empezando por
`auth-core-mc`) usan para enviar correo transaccional, protegido con el
mismo mecanismo OAuth2 que ya usan entre sí. Es el ticket que junta
plantillas (003) y cola (004) detrás de una API real. Nace de HU-1 y
HU-6 en `docs/definiciones/mail-core-mc-v1.md`.

## Alcance
**Incluye:**
- `mail-core-mc` como resource server OAuth2: valida JWTs emitidos por
  `auth-core-mc` contra su JWK Set (sin base de credenciales propia).
- `POST /v1/emails` (`template_id`, `to`, `variables`) protegido por
  scope `mail:send`.
- Verificación contra `SuppressionEntry` antes de encolar.
- Endpoint de consulta de estado (`GET /v1/emails/:id`).

**No incluye:**
- Webhooks de notificación de estado (ticket 007).
- Identidad de remitente por tenant (Fase 2).

## Criterios de aceptación (TDD)
- Dado un JWT válido con scope `mail:send`, cuando hago
  `POST /v1/emails` con datos válidos, entonces recibo `202 Accepted`
  con un `message_id` y el mensaje queda encolado (ticket 004).
- Dado un JWT sin el scope `mail:send`, entonces recibo `403`.
- Dado un JWT expirado o de un `client_id` no reconocido por el JWK Set
  de `auth-core-mc`, entonces recibo `401`.
- Dado un destinatario presente en `SuppressionEntry`, cuando envío la
  petición, entonces recibo `202` pero `Message.status = suppressed` y
  no se encola ningún job de envío real.
- Dado un `template_id` inexistente o variables faltantes, entonces
  recibo `400` antes de encolar (ver también ticket 003).

## Hecho

- **`AuthModule` (resource server OAuth2)**: `JwtStrategy` (passport-jwt +
  jwks-rsa contra `{AUTH_CORE_MC_ISSUER_URI}/oauth2/jwks`, cacheado y con
  rate-limit), `JwtAuthGuard` (401 explícito, logueado), `ScopesGuard` +
  `@RequireScopes()` (403 explícito).
- **`POST /v1/emails` y `GET /v1/emails/:id`** en `EmailsController`,
  protegidos con `@RequireScopes('mail:send')`.
- **`EmailsService.send()`**: resuelve tenant (find-or-create por
  `external_id`, migración nueva en `Tenant`), revisa supresión
  (global + de ese tenant), renderiza vía `TemplatesService.render()`
  (un `template_id` inexistente se traduce a `400`, no al `404` interno),
  crea el `Message`, encola (ticket 004) — o si está suprimido, crea el
  `Message` con `status=suppressed` sin encolar nada.
- **Descubrimiento real y bloqueante durante el ticket: `auth-core-mc`
  no tenía el grant `client_credentials`** — el documento de definición
  lo había asumido sin verificar. Resuelto como su propio ticket en ese
  repo (`auth-core-mc` #048, con VoBo del Product Owner), no "de paso"
  dentro de este ticket — ver ese repo para el detalle completo.
- **45 tests en verde** (unitarios: `ScopesGuard`, `JwtAuthGuard`,
  `JwtStrategy.validate()`, `EmailsService` con los 5 caminos de AC,
  `EmailsController`) + **verificado en vivo, los 5 criterios de
  aceptación, contra `auth-core-mc` real corriendo, no mocks**:
  - AC1: token válido + scope `mail:send` → `202` → el worker lo entrega
    de verdad a Postfix (ticket 001/004) → `status=sent` con
    `providerMessageId` real.
  - AC2: token válido de un segundo cliente sin `mail:send` → `403`.
  - AC3: sin token → `401`; token malformado → `401`.
  - AC4: destinatario en `SuppressionEntry` (global) → `202` con
    `status=suppressed`, sin encolar (confirmado que `TemplatesService.render`
    ni se llamó).
  - AC5: `template_id` inexistente → `400`; variable requerida faltante
    → `400` (mismo `TemplateRenderFilter` del ticket 003, reutilizado
    tal cual).
- **Gotcha real de `@nestjs/passport` encontrado al levantar la app**
  (no en ningún test — `@SpringBootTest`-equivalente de Nest tampoco lo
  hubiera detectado): `PassportModule.register(...)` hay que importarlo
  en cada módulo que use `@UseGuards(JwtAuthGuard)` por clase, no solo
  en `AuthModule` — documentado en `docs/ARQUITECTURA.md` y en el código.
- `docs/API.md`, `docs/BASE_DE_DATOS.md`, `docs/README.md`,
  `docs/ARQUITECTURA.md` y `.env.example` actualizados.
- **Quality Gate de Sonar encontró un code smell real** en
  `resolveTenant` (`externalId ?? '__default__'` reasignado dentro del
  cuerpo) — corregido a un parámetro con valor por defecto
  (`externalId: string = '__default__'`), más simple y sin reasignación.
- **Fuera de alcance, anotado explícitamente para un ticket futuro**:
  `/v1/templates/**` (ticket 003) sigue sin protección — no se le agregó
  de paso, se documentó como pendiente.

