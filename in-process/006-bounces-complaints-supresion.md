# 006 — Procesamiento de bounces/complaints y lista de supresión

## Objetivo
Procesar automáticamente los bounces y complaints que Postfix recibe
después de una entrega, para mantener la lista de supresión al día y no
seguir enviando a direcciones inválidas o que se quejan de spam. Nace de
HU-4 en `docs/definiciones/mail-core-mc-v1.md`.

## Alcance
**Incluye:**
- Codificación VERP en el `MAIL FROM` de cada envío (incluye el
  `message_id` en el sobre de retorno) para poder emparejar
  programáticamente cualquier bounce que regrese.
- Bounce-processor que escucha las notificaciones DSN de la instancia
  transaccional de Postfix (ticket 001), distingue hard bounce de soft
  bounce, y actualiza `Message.status` y `SuppressionEntry`
  correspondientemente.
- Manejo de complaints (feedback loop) si el proveedor de recepción lo
  soporta.

**No incluye:**
- Notificar a la app llamante sobre estos cambios de estado — eso es el
  ticket 007 (webhooks).

## Criterios de aceptación (TDD)
- Dado un hard bounce (DSN permanente) para un `message_id` codificado
  vía VERP, cuando el bounce-processor lo recibe, entonces el
  destinatario entra a `SuppressionEntry` (`reason = bounce`) y
  `Message.status = bounced`.
- Dado un soft bounce (transitorio), entonces NO se agrega a supresión
  (puede reintentarse en un envío futuro).
- Dado un complaint, entonces el destinatario entra a `SuppressionEntry`
  con `reason = complaint`.
- Dado un destinatario ya en `SuppressionEntry`, cuando llega cualquier
  envío nuevo hacia él (de cualquier tenant), entonces se bloquea antes
  de encolar (verificado también por el ticket 005).

## Hecho
