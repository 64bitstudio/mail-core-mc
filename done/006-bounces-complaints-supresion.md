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

- **VERP** (`verp.util.ts`): `TransactionalProcessor` manda cada envío
  con `envelope.from = bounces+{messageId}@mail.64bitstudio.com`
  (`From` visible sin cambios) — sin depender de parsear el cuerpo del
  bounce para saber a qué mensaje corresponde.
- **Buzón dedicado `bounces@mail.64bitstudio.com`**, no un pipe
  transport — `recipient_delimiter = +` (ya en `docker-mailserver` por
  defecto) hace que cualquier `bounces+ALGO@...` caiga en el mismo
  buzón virtual, sin tocar `transport_maps`/`master.cf`.
- **`MaildirWatcherService`** (chokidar) vigila la carpeta `new/` de ese
  Maildir, procesa cada archivo con `parseDsnOrComplaint` y lo borra (o
  lo deja si el procesamiento falla, para no perder datos).
- **`parseDsnOrComplaint`**: distingue DSN de ARF por el `Content-Type`
  del mensaje; clasifica `Action: failed` como permanente y
  `Action: delayed` como transitorio (RFC 3464).
- **`BounceProcessorService`**: hard bounce/complaint → `SuppressionEntry`
  **global** (`tenantId=null`, HU-4: "cualquier tenant, no solo el que
  lo originó") + `Message.status=bounced`. Soft bounce → solo se
  loguea, no suprime.
- **Bug real de infra encontrado y corregido**: `docker-mailserver`
  dejaba el dominio en `mydestination` Y `virtual_mailbox_domains` a la
  vez — Postfix priorizaba entrega local Unix, así que ningún buzón
  virtual (ni `bounces@`, ni `noreply@`) llegaba nunca a Dovecot.
  Corregido con `infra/mta/postfix-main.cf` (`mydestination =
  localhost`), montado explícito en `docker-compose.yml` para que quede
  versionado (no vive en `docker-data/`, gitignorado).
- **Gotcha real de `mailparser` encontrado contra un DSN real (no un
  supuesto)**: expone `message/feedback-report` (ARF) como
  `.attachments`, pero NO `message/delivery-status` (DSN) — ese
  contenido queda concatenado en `.text`. El parser se ajustó a este
  comportamiento real, verificado con `node -e` antes de asumir nada.
- **58 tests en verde**, incluyendo fixtures reales/realistas:
  `hard-bounce-real.eml` es un DSN **capturado en vivo** de esta misma
  instancia de Postfix (no inventado); `soft-bounce.eml` sigue esa
  misma estructura real con `Action: delayed`; `complaint-arf.eml`
  sigue RFC 5965 (ningún proveedor real nos manda complaints todavía —
  requeriría estar registrado con un feedback loop como Gmail
  Postmaster, trabajo de VM/producción, ticket 009).
- **Verificado en vivo, de punta a punta, sin mocks (AC1 y el AC4 ya
  probado en el ticket 005)**: envío real a una dirección inexistente
  en nuestro propio dominio → Postfix genera un DSN real → llega a
  `bounces@` → se procesa → `SuppressionEntry` global creada,
  `Message.status=bounced` con el diagnóstico real (`550 5.1.1`) → un
  envío posterior a esa misma dirección queda bloqueado
  (`202 suppressed`, sin encolar nada).
- `docs/ARQUITECTURA.md`, `docs/README.md`, `docs/API.md` y
  `.env.example` actualizados.

