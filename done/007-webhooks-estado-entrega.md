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

**Implementado:**
- `POST /v1/webhooks` (`WebhooksModule`, protegido con `mail:send` —
  ver nota de scope abajo) registra/rota `{url, secret}` por tenant
  (upsert por `tenant_id`, único — un webhook activo por tenant).
- `WebhookQueueService`/`WebhookProcessor` (segunda cola BullMQ,
  `webhook-dispatch`) disparan el `POST` firmado
  (`X-Signature: sha256=<hmac>`) en cada cambio terminal de
  `Message.status`: `sent`, `failed` (inmediato o al agotar
  reintentos), `bounced`, `complained` (este último es nuevo — antes un
  complaint solo creaba la `SuppressionEntry` sin tocar el `status` del
  mensaje).
- Reintentos con backoff exponencial ante 5xx/timeout del receptor del
  webhook (`WEBHOOK_MAX_ATTEMPTS`/`WEBHOOK_BACKOFF_DELAY_MS`); 4xx no
  se reintenta. `fetch` con timeout de 10s. Ausencia de webhook
  registrado = no-op, nunca bloquea el pipeline de envío.
- `TenantsService` extraído de `EmailsService` (lo necesitaba también
  `WebhooksService`) — evita duplicar el find-or-create de tenant.

**Tests:** 78/78 en verde (21 archivos), incluyendo 6 archivos nuevos
para este ticket (`webhook-signature.util`, `webhook-error.util`,
`webhook.processor`, `webhooks.service`, `webhooks.controller`,
`tenants.service`). Cobertura del proyecto: 95.39% statements / 77.39%
branches.

**Verificado en vivo, de punta a punta, sin mocks** (app real +
`auth-core-mc` real + Postfix real + un receptor HTTP local):
1. `POST /v1/webhooks` real → `secret` de 64 hex chars devuelto.
2. Envío real de un correo (`POST /v1/emails` con JWT real de
   `auth-core-mc`) → Postfix lo acepta → evento `sent` recibido en el
   receptor con `X-Signature` válida (verificada recalculando el HMAC
   con el `secret` devuelto en el paso 1).
3. Envío real a un buzón inexistente en `mail.64bitstudio.com` →
   Postfix genera un DSN real (`550 5.1.1`) → `MaildirWatcherService`/
   `BounceProcessorService` (ticket 006) lo procesa → evento `bounced`
   recibido, también con firma válida — `Message.status` en base de
   datos coincide exactamente con el payload de ambos webhooks.
4. Los caminos de reintento/fallo permanente (5xx reintenta, 4xx no,
   error de red reintenta, se agota y se descarta registrando el
   fallo) se probaron a nivel de integración con `vi.stubGlobal('fetch',
   ...)` (`webhook.processor.spec.ts`) — no se forzó un E2E real para
   estos porque requeriría un receptor que falle de forma controlada
   sin infraestructura adicional; el comportamiento es determinista
   (BullMQ + `fetch`) y ya está cubierto sin mocks de Prisma/red de por
   medio en el resto del flujo.

**Nota de alcance, no bloqueante:** el criterio de aceptación menciona
"cuando `Message.status` cambia a `delivered` o `bounced`". `mail-core-mc`
nunca ha modelado una confirmación positiva de entrega (`delivered`) —
ni antes de este ticket ni ahora — porque no existe un mecanismo estándar
de DSN de éxito equivalente al de bounce (la mayoría de receptores no lo
mandan); el estado "de éxito" que el sistema sí observa es `sent`
(Postfix aceptó el mensaje), que es el que dispara el webhook. Esto ya
era así desde el ticket 004/005, no es un recorte de este ticket — se
deja explícito aquí por si el Product Owner quiere un mecanismo de
`delivered` real más adelante (ej. vía DSN de éxito solicitado
explícitamente con `Return-Receipt-To`, si el receptor lo soporta).

**Decisión de scope reutilizada, documentada en el código y en
`docs/API.md`:** `POST /v1/webhooks` requiere el mismo scope
`mail:send` que `POST /v1/emails`, no un `mail:admin` separado — no
existía un scope de administración distinto en `auth-core-mc` y crear
uno era mayor alcance del que pedía este ticket. Queda anotado como
posible mejora futura, no como decisión final.
