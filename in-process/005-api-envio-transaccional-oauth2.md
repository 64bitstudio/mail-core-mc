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
