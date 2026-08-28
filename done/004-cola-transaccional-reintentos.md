# 004 — Cola transaccional con reintentos y backoff

## Objetivo
Construir el worker que toma un mensaje ya renderizado y lo entrega vía
SMTP a la instancia transaccional de Postfix (ticket 001), con
reintentos automáticos ante fallas transitorias. Es la pieza que conecta
la app con la infraestructura de envío real. Nace de HU-3 en
`docs/definiciones/mail-core-mc-v1.md`.

## Alcance
**Incluye:**
- Cola `transactional` en BullMQ (alta prioridad).
- Worker que consume la cola, envía vía Nodemailer al Postfix
  transaccional (ticket 001), y actualiza `Message.status`.
- Reintentos con backoff exponencial ante rechazo SMTP `4xx`
  (transitorio), hasta un máximo de intentos configurable.
- Paso a `failed` (sin más reintentos) ante rechazo `5xx` o al agotar los
  reintentos.

**No incluye:**
- Procesamiento de bounces que llegan *después* de una entrega SMTP
  exitosa (DSN asíncrono) — eso es el ticket 006 (VERP + supresión).
- La API HTTP que encola el job — eso es el ticket 005.

## Criterios de aceptación (TDD)
- Dado un job en la cola `transactional`, cuando el worker lo procesa y
  Postfix acepta el mensaje, entonces `Message.status = sent`.
- Dado un rechazo SMTP `4xx`, cuando el worker reintenta, entonces el
  intervalo entre reintentos crece exponencialmente y no supera el
  máximo de intentos configurado.
- Dado un rechazo SMTP `5xx`, o el agotamiento de reintentos, entonces
  `Message.status = failed` y el job no se vuelve a encolar
  automáticamente.

## Hecho

- `EmailsModule`: `TransactionalQueueService` (encola, `jobId = messageId`
  para dedup, prioridad alta, backoff exponencial configurable por env),
  `TransactionalProcessor` (worker BullMQ, entrega vía Nodemailer al
  Postfix del ticket 001).
- Clasificación de errores SMTP por `responseCode` (`isTransientSmtpError`):
  4xx/red → transitorio (reintenta), 5xx → permanente (falla directo, sin
  reintentar).
- `onFailed` marca `Message.status = failed` solo cuando se agotan los
  intentos configurados — mientras tanto solo registra `attemptsMade`/
  `lastError` para observabilidad, sin tocar `status`.
- Migración nueva: `Message.renderedHtml` (faltaba en el esquema del
  ticket 002 — el worker "solo envía correo ya renderizado" pero no
  había dónde guardar el HTML final, solo el subject), `attemptsMade`,
  `lastError`.
- 26 tests en verde (unitarios: clasificador de errores, opciones de la
  cola, y los 3 caminos del worker — éxito/transitorio/permanente —
  mockeando Nodemailer y Prisma). Verificado también en vivo de punta a
  punta contra el Postfix real del ticket 001 (sin la API HTTP, que es
  el ticket 005 — se simuló ese paso directo): mensaje creado ya
  renderizado → encolado → Postfix respondió `250 2.0.0 Ok` →
  `Message.status = sent` con el `Message-Id` real.
- `docs/BASE_DE_DATOS.md` y `docs/ARQUITECTURA.md` actualizados.
- **Hallazgo de seguridad, corregido en el momento (otra vez expuesta
  una contraseña por accidente):** al copiar las credenciales SMTP del
  `.env` raíz al de `backend/`, un `>>` sin salto de línea previo pegó
  la nueva variable en la misma línea que `REDIS_URL` — el harness
  mostró el diff del archivo corregido, lo que expuso la contraseña en
  la sesión. Se rotó de inmediato en Postfix y en ambos `.env`. Segunda
  vez que pasa esto en el proyecto (la primera fue con `swaks` en el
  ticket 001) — vale la pena que quien programe el ticket 009 (VM) tenga
  esto presente al manejar credenciales SMTP ahí también.

