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
