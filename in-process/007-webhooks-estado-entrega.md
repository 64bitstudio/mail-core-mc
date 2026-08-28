# 007 — Webhooks firmados de estado de entrega

## Objetivo
Notificar a la app llamante (empezando por `auth-core-mc`) cuando cambie
el estado de un correo que envió, para que pueda saber si un reset de
password realmente llegó, en vez de asumir que "encolado" significa
"entregado". Nace de HU-5 en `docs/definiciones/mail-core-mc-v1.md`.

## Alcance
**Incluye:**
- Registro de webhook por app llamante (`url` + `secret` para firma).
- Disparo de `POST` al webhook en cada cambio relevante de
  `Message.status` (`sent`/`delivered`/`bounced`/`complained`/`failed`),
  firmado con `X-Signature: HMAC-SHA256`.
- Reintentos con backoff si el endpoint del llamante falla o hace
  timeout, hasta un máximo de intentos; después se descarta y se
  registra el fallo (nunca bloquea el pipeline de envío).

**No incluye:**
- Eventos de `opened`/`clicked`/`unsubscribed` — esos nacen en la Fase 3
  (tracking de marketing), aunque el mecanismo de firma/entrega de
  webhook se reutiliza tal cual.

## Criterios de aceptación (TDD)
- Dado un webhook registrado, cuando `Message.status` cambia a
  `delivered` o `bounced`, entonces `mail-core-mc` hace `POST` al
  webhook con el payload firmado correctamente.
- Dado que el endpoint del llamante responde `5xx` o hace timeout,
  entonces el webhook se reintenta con backoff hasta el máximo
  configurado y luego se descarta registrando el fallo — sin afectar el
  estado real del mensaje ni el resto del pipeline.
- Dado un payload de webhook, cuando el receptor valida la firma con el
  `secret` registrado, entonces la validación es exitosa (verificable
  con una prueba de integración simulando el receptor).

## Hecho
