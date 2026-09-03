# Arquitectura — mail-core-mc

## Qué es

Servicio propio de envío de correo electrónico ("mail core"), construido
para que el ecosistema (empezando por `auth-core-mc`) no dependa de un
proveedor externo (SES, SendGrid, Mailgun, etc.) para enviar correo.

## Relación con auth-core-mc y otras apps

`mail-core-mc` y `auth-core-mc` son servicios independientes y desplegables
por separado:

- **auth-core-mc** sigue siendo el dueño de identidad, sesiones, permisos y
  autenticación para todo el ecosistema.
- **mail-core-mc** es una app *dependiente* de `auth-core-mc` para todo lo
  que es AuthN/AuthZ de sus propios endpoints (igual que cualquier otra app
  del ecosistema) — no reimplementa login, usuarios ni permisos.
- Después de este bootstrap, `auth-core-mc` pasará a consumir `mail-core-mc`
  para el envío de los correos que hoy dependen de un tercero (verificación
  de cuenta, reseteo de password, 2FA por correo, etc.).

## Decisiones de arquitectura

Ver `docs/definiciones/mail-core-mc-v1.md` para el documento completo de
definición (HUs, diagramas, diseño técnico). Esta sección se actualiza
conforme cada ticket de la Fase 1 en adelante aterriza decisiones reales.

## Infraestructura de envío transaccional (ticket 001)

**Fase actual: desarrollo, corriendo en la máquina de desarrollo local**
(decisión explícita del Product Owner). Postfix + OpenDKIM corren vía
Docker (`infra/mta/docker-compose.yml`, imagen
`docker-mailserver/docker-mailserver`) — el mismo compose se reutilizará
sin cambios de fondo cuando esto se mueva a la VM dedicada de producción
(solo cambia dónde vive el volumen de datos y la IP pública en el
registro SPF).

- **Dominio de envío:** `mail.64bitstudio.com` (subdominio dedicado,
  aislado del dominio raíz `64bitstudio.com` que ya usa Cloudflare Email
  Routing para correo normal del negocio — no se tocó nada de eso).
- **DNS (Cloudflare, zona `64bitstudio.com`):**
  - SPF: `v=spf1 ip4:<IP de salida actual> ~all` — softfail mientras se
    calienta reputación. **Se debe actualizar el valor de IP al migrar a
    la VM** (único cambio de DNS que requiere la migración).
  - DKIM: selector `mail`, llave RSA 2048 generada con
    `docker-mailserver` (`mail._domainkey.mail.64bitstudio.com`). La
    llave privada vive en `infra/mta/docker-data/` (gitignored) — nunca
    se versiona ni se loguea.
  - DMARC: `v=DMARC1; p=none; adkim=s; aspf=s` — modo monitoreo
    (`p=none`) hasta validar comportamiento real; se endurece a
    `quarantine`/`reject` más adelante, una vez en la VM con volumen e
    historial reales.
- **Limitación conocida y aceptada de la fase dev:** no hay registro PTR
  (reverse DNS) configurable desde una IP residencial/dinámica, y rangos
  residenciales suelen estar pre-listados en blocklists tipo Spamhaus
  PBL independientemente de que SPF/DKIM/DMARC estén correctos. Por eso
  la validación de esta fase se limita a confirmar que la *configuración*
  (firma DKIM válida, alineación SPF/DMARC) es correcta — no a lograr
  colocación en bandeja de entrada de Gmail/Outlook, que se valida en
  serio hasta la VM con IP dedicada + PTR + plan de calentamiento
  ejecutándose de verdad (ver "Plan de calentamiento de IP" abajo).

## Cola transaccional y worker de envío (ticket 004)

`EmailsModule` (`backend/src/emails/`) — BullMQ sobre Redis:

- **`TransactionalQueueService`**: encola un `Message` ya renderizado
  (`jobId = messageId`, dedup automática si algo lo encola dos veces).
  Prioridad alta, `attempts`/backoff exponencial configurables por env
  (`TRANSACTIONAL_MAX_ATTEMPTS`, `TRANSACTIONAL_BACKOFF_DELAY_MS`).
- **`TransactionalProcessor`**: el worker. Entrega vía Nodemailer al
  Postfix transaccional (ticket 001). Ante un rechazo SMTP:
  - **4xx (transitorio)** o error de red: relanza el error para que
    BullMQ reintente con backoff — `onFailed` marca `Message.status =
    failed` solo cuando `attemptsMade` llega al máximo configurado.
  - **5xx (permanente)**: marca `failed` de inmediato y NO relanza —
    reintentar una dirección inexistente no tiene sentido.
  - Éxito: `Message.status = sent`, con el `Message-Id` real de Postfix.
- El worker **nunca vuelve a renderizar** — consume `rendered_subject`/
  `rendered_html` ya guardados en el `Message` (ver `docs/BASE_DE_DATOS.md`).
  Quien lo llena es el ticket 005 (API de envío), que todavía no existe —
  mientras tanto se probó en vivo simulando ese paso directamente.

## API de envío + resource server OAuth2 (ticket 005)

`AuthModule` (`backend/src/auth/`): `mail-core-mc` valida JWTs de
`auth-core-mc` vía `passport-jwt` + `jwks-rsa` contra su JWK Set — sin
base de credenciales propia, sin volver a implementar login. Un
`JwtAuthGuard` (401 si el token no es válido) + `ScopesGuard`
(`@RequireScopes('mail:send')`, 403 si falta el scope) protegen
`POST /v1/emails`.

**Gotcha real de NestJS/`@nestjs/passport` encontrado al levantar la
app:** `PassportModule.register(...)` (necesario para que `AuthGuard()`
resuelva su `AuthModuleOptions`) hay que importarlo en **cada módulo**
que use `@UseGuards(JwtAuthGuard)` por referencia de clase, no solo en
`AuthModule` donde vive el guard — el DI de Nest resuelve la clase del
guard con el injector del módulo que hospeda al controller
(`EmailsModule`), no con el del módulo que lo declaró. Documentado
también en `EmailsModule` mismo.

`EmailsService.send()` es el punto donde se juntan los tickets
anteriores: resuelve el tenant del llamante (find-or-create por
`external_id`, ver `docs/BASE_DE_DATOS.md`), revisa supresión (global o
de ese tenant), renderiza con `TemplatesService.render()` (ticket 003 —
un `template_id` inexistente se traduce a `400`, no al `404` que
`TemplatesService` lanza internamente, porque desde esta API es un dato
de entrada inválido, no un recurso que buscar), y solo si nada de eso
bloquea, crea el `Message` y encola (ticket 004).

**Verificado en vivo, los 5 criterios de aceptación, contra
`auth-core-mc` real corriendo** (no mocks): token válido + scope
correcto → `202` → el worker lo entrega de verdad a Postfix →
`status=sent`. Token de un segundo cliente sin `mail:send` → `403`. Sin
token / token malformado → `401` (dos casos). Destinatario en supresión
→ `202` con `status=suppressed`, sin encolar. `template_id` inexistente
y variable faltante → `400` en ambos casos.

## Bounces/complaints y lista de supresión (ticket 006)

**VERP**: cada envío real usa `envelope.from = bounces+{messageId}@mail.64bitstudio.com`
(el header `From` visible sigue siendo el de siempre) — cualquier bounce
o complaint que regrese trae el `message_id` codificado en su propio
`Delivered-To`, sin depender de parsear heurísticamente el cuerpo.

**Buzón dedicado, no un pipe transport de Postfix**: `bounces@mail.64bitstudio.com`
es un buzón virtual normal (Dovecot). `recipient_delimiter = +` (ya
configurado por `docker-mailserver` por defecto) hace que *cualquier*
`bounces+ALGO@...` caiga en ese mismo buzón, con el "ALGO" preservado en
`Delivered-To` — no hizo falta tocar `transport_maps`/`master.cf` para
enrutar direcciones VERP una por una.

**`MaildirWatcherService`** (`backend/src/bounces/`) vigila la carpeta
`new/` de ese Maildir con `chokidar` — no es un buzón para revisar por
IMAP, cada archivo se parsea y se borra (si el parseo falla, se deja el
archivo para inspección manual en vez de perderlo). `parseDsnOrComplaint`
distingue DSN (bounce) de ARF (complaint) por el `Content-Type` del
mensaje (`multipart/report; report-type=delivery-status` vs.
`report-type=feedback-report`).

**Gotcha real de `mailparser` encontrado al probar contra un DSN real
de este mismo Postfix (no un supuesto de la documentación)**: expone
`message/feedback-report` (ARF) como `.attachments`, pero **no**
`message/delivery-status` (DSN) — ese contenido queda concatenado
dentro de `.text`, junto con la parte humana legible del reporte. El
parser extrae `Action:`/`Status:`/`Diagnostic-Code:` de ahí para el
caso DSN, y sigue usando `.attachments` para el caso ARF.

**Bug real de infra encontrado y corregido en el camino**:
`docker-mailserver` dejaba `mail.64bitstudio.com` tanto en
`mydestination` (entrega local por usuario Unix) como en
`virtual_mailbox_domains` (buzones virtuales de Dovecot) — Postfix
priorizaba `mydestination`, así que *ningún* buzón virtual (ni
`bounces@`, ni `noreply@`) llegaba nunca a Dovecot; rebotaban con
"unknown user". Fix: `infra/mta/postfix-main.cf` (`mydestination =
localhost`), montado explícitamente en `docker-compose.yml` (no vive en
`docker-data/`, que está gitignorado) para que quede versionado.

**Supresión siempre global** (`tenantId = null`), nunca por tenant — un
hard bounce o complaint es una señal sobre la dirección en sí (HU-4: "no
solo al que lo originó"). Un soft bounce (`Action: delayed`) NO suprime
— solo se loguea, puede reintentarse en un envío futuro.

**Verificado en vivo, de punta a punta, sin mocks**: envío real a una
dirección inexistente en `mail.64bitstudio.com` → Postfix genera un DSN
real → llega a `bounces@` → el watcher lo procesa → `SuppressionEntry`
global creada, `Message.status = bounced` → un envío posterior a esa
misma dirección queda bloqueado (`202 suppressed`, sin encolar). Soft
bounce y complaint se probaron con fixtures reales/realistas (un DSN de
verdad capturado en vivo para el caso soft; un ARF construido siguiendo
RFC 5965 para complaint, ya que generar uno real requeriría estar
registrado con un proveedor como Gmail Postmaster — trabajo de VM/producción,
ticket 009, no de esta fase dev).

## Webhooks firmados de estado de entrega (ticket 007)

`WebhooksModule` (`backend/src/webhooks/`) — una segunda cola BullMQ
(`WEBHOOK_QUEUE = 'webhook-dispatch'`), mismo patrón exacto de
`TransactionalQueueService`/`TransactionalProcessor` (ticket 004):
`WebhookQueueService.enqueue(messageId, event)` encola, `WebhookProcessor`
entrega.

**Quién dispara un evento de webhook** — cada punto del sistema que ya
cambia `Message.status` a un estado terminal, después de escribir en la
base de datos, encola el evento correspondiente:
- `TransactionalProcessor` (ticket 004): `sent` en éxito, `failed` en
  rechazo permanente inmediato o al agotar reintentos.
- `BounceProcessorService` (ticket 006): `bounced` en un DSN permanente,
  `complained` en un ARF. Antes del ticket 007 un complaint solo creaba
  la `SuppressionEntry` sin tocar `Message.status` — ahora también
  marca `status = complained`, para que el llamante pueda consultarlo
  vía `GET /v1/emails/:id` igual que cualquier otro estado terminal.

**`TenantsService`** (`backend/src/tenants/`) — extraído de
`EmailsService` en este ticket: el find-or-create de `Tenant` por
`external_id` (ticket 005) lo necesitaban tanto `EmailsService` como el
nuevo `WebhooksService`, así que se movió a un módulo compartido en vez
de duplicar la lógica.

**Firma**: `X-Signature: sha256=<hmac-sha256 hex>` del cuerpo JSON
exacto, con un `secret` de 32 bytes aleatorios generado por tenant
(`webhook-signature.util.ts`). Se regenera en cada `POST /v1/webhooks`
— registrar de nuevo rota el secret, no lo reutiliza (evita que un
secret viejo filtrado siga siendo válido indefinidamente).

**Reintentos**: mismo criterio transitorio/permanente que ticket 004
pero aplicado a la respuesta del *receptor* del webhook
(`webhook-error.util.ts`): 5xx o error de red/timeout → transitorio,
relanza para que BullMQ reintente con backoff exponencial
(`WEBHOOK_MAX_ATTEMPTS`/`WEBHOOK_BACKOFF_DELAY_MS`); 4xx → permanente,
no tiene caso reintentar (el receptor está rechazando el payload a
propósito, ej. firma inválida de su lado). `fetch` con `AbortController`
de 10s — un receptor colgado no bloquea el worker indefinidamente.

Si el tenant del mensaje no tiene webhook registrado, `WebhookProcessor`
no hace nada (no es un error, la mayoría de los tenants no tendrán uno
en Fase 1).

**Verificado en vivo, de punta a punta, sin mocks**: `POST /v1/webhooks`
contra un receptor HTTP local real → envío real de un correo → evento
`sent` recibido con firma HMAC verificada contra el `secret` devuelto
por el registro → envío real a un buzón inexistente → Postfix genera un
DSN real (550 5.1.1) → `MaildirWatcherService`/`BounceProcessorService`
lo procesa → evento `bounced` recibido, también con firma verificada,
`Message.status` en base de datos coincidiendo exactamente con el
payload del webhook en ambos casos.

## Protección de `/v1/templates/**` (ticket 010)

Quedó documentado como pendiente al cerrar el ticket 005 (no se agregó
"de paso" en ese ticket para no mezclar alcances). Mismo mecanismo tal
cual (`JwtAuthGuard` + `ScopesGuard`, `@RequireScopes('mail:send')`) —
reusa el único scope existente, no se creó un `mail:admin` separado
(decisión explícita del Product Owner: un cliente que puede enviar
correo también puede administrar plantillas, por ahora).

`TemplatesModule` repite el mismo gotcha de `PassportModule.register(...)`
documentado en `EmailsModule`/`WebhooksModule` — cada módulo que usa
`@UseGuards(JwtAuthGuard)` en su controller necesita su propia
visibilidad de `AuthModuleOptions`.

**Verificado en vivo contra `auth-core-mc` real** (mismo patrón que
ticket 005): sin token → `401` en los 4 endpoints. Token válido pero de
un client_id sin el scope `mail:send` (client de prueba
`mail-core-mc-noscope-test`, sembrado a mano en `auth-core-mc` solo para
este caso) → `403`. Token con el scope correcto → comportamiento idéntico
al de antes del ticket, sin regresión funcional (`create`/`render`
probados de punta a punta con datos reales).

## Plan de calentamiento de IP (a ejecutar en la VM de producción)

Rampa gradual de volumen diario recomendada para una IP/dominio sin
historial previo, evitando que los principales proveedores (Gmail,
Outlook, Yahoo) lo traten como origen sospechoso:

| Semana | Volumen diario máximo sugerido |
|---|---|
| 1 | 50 |
| 2 | 100–200 |
| 3 | 500 |
| 4 | 1,000–2,000 |
| 5+ | Sin tope fijo, subir gradualmente monitoreando tasa de bounce/quejas |

Si en cualquier semana la tasa de bounce supera ~2% o hay quejas de spam
detectables, se pausa la rampa hasta entender la causa antes de seguir
subiendo volumen. Este plan aplica desde el día 1 de la VM de
producción, no durante la fase de desarrollo local.

## Ticket 011: pipeline de CI/CD a la VM (Jenkins/corePipeline) — EN CURSO

El ticket original (en `pending/`/`in-process/`) describía GitHub
Actions con ramas `integracion`/`main`; reemplazado por el pivote a
Jenkins ya vigente para todo el ecosistema (ver
`auth-core-mc/done/049-pipeline-cicd-deploy-vm.md`, "SEGUNDO PIVOTE", y
`platform/docs/ARQUITECTURA.md`). Mismo patrón que auth-core-mc, copiado
y adaptado — sin reinventar nada:

- **Jenkinsfile** mínimo con `@Library('platform') _` +
  `corePipeline(...)`, `buildAndTest` propio (npm/Prisma/vitest/
  sonar-scanner en vez de Gradle), `containerPort: 3000`,
  `healthPath: '/health'`, `healthyPattern: '"database":"ok"'` (el
  healthcheck propio de `backend/src/health/health.controller.ts`, no
  Spring Boot Actuator).
- **`backend/Dockerfile`**: `node:24-slim`, no alpine — evita a
  propósito la clase de bugs de compatibilidad musl/OpenSSL de los
  binarios de `@prisma/engines` (aunque el cliente en sí usa el driver
  adapter `@prisma/adapter-pg`, sin motor nativo, `prisma migrate
  deploy` sigue necesitando un binario de motor). `ENTRYPOINT` corre
  `npx prisma migrate deploy` antes de arrancar la app — necesario
  porque, a diferencia de Spring Boot/Flyway, Prisma no migra solo al
  bootear.
- **`deploy/docker-compose.{dev,qa,prod}.yml`**: Postgres/Redis
  persistentes (volúmenes). Puertos de host reservados (coordinado con
  auth-core-mc, que ya usa 8080/8081/8082): **PROD 8083 / DEV 8084 / QA
  8085**.
- **`deploy/cleanup.sh`/`deploy/env-ctl.sh`**: copiados de
  `auth-core-mc/deploy/` (ticket 049), adaptados solo de nombre.
- **Secretos**: `DB_PASSWORD` vía Vault (`secret/mail-core-mc/<env>`,
  KV v2) — mismo default de `corePipeline` que ya usa auth-core-mc, sin
  ningún cambio de policy (la AppRole `jenkins-infra` ya cubre cualquier
  proyecto vía wildcard de un segmento). `SMTP_*`/
  `BOUNCES_MAILDIR_PATH` quedan como variables simples (vacías por
  defecto) — decisión explícita de no meter Vault Transit/AppRole propio
  aquí: mail-core-mc no tiene el caso de uso de cifrado por tenant que sí
  tiene auth-core-mc (ticket 017); el objetivo de este ticket es que el
  pipeline funcione, no sobre-construir.
- **Jenkins ampliado** (repo `platform`): Node.js 24 + sonar-scanner CLI
  agregados a la imagen compartida (no existían — auth-core-mc usa el
  plugin de Sonar de Gradle, self-contained). Verificado en vivo:
  `node --version` → v24.20.0, `sonar-scanner --version` → 6.2.1.4610,
  nativo en Linux aarch64 (la VM real).

**2 hallazgos reales encontrados corriendo el pipeline de verdad** (ver
`in-process/011-pipeline-cicd-deploy-vm.md` para el detalle completo con
evidencia): Postgres/Redis de test no eran alcanzables por `localhost`
desde el contenedor de Jenkins (mismo bug ya documentado en
`corePipeline.groovy` para el healthcheck de deploy, no aplicado al
principio a este propio pipeline — fix: `backend/docker-compose.ci.yml`,
conecta los servicios de test a la red `edge`); y un leak real de
`TELEGRAM_BOT_TOKEN` en el log de consola de Jenkins (`corePipeline.groovy`
sin `set +x` en el `post{always}` — ya corregido en `platform`,
`64bitstudio/platform#27`).

**Bloqueador real, pendiente de una acción de Marco (Owner de la
organización)**: la GitHub App `64bitstudio-jenkins-ci` NO tiene
`mail-core-mc` en su lista de repos instalados (verificado con un JWT
real de la App + installation token, `GET /installation/repositories`
→ solo `auth-core-mc`) — sin esto, Jenkins no puede reportar el commit
status `continuous-integration/jenkins/branch` a GitHub (403 "Resource
not accessible by integration"), y la branch protection de `dev` nunca
deja pasar el merge aunque el build interno de Jenkins esté en verde.
Detalle completo, incluida la acción exacta pendiente, en
`in-process/011-pipeline-cicd-deploy-vm.md`.

**Subdominio público, decidido por Marco**: `mailcore.64bitstudio.com`
(`mail.64bitstudio.com` ya es el hostname del MTA, no reusable) —
`mailcore-qa`/`mailcore-dev` para QA/DEV, mismo patrón de sufijos que
auth-core-mc. Vhost/`certbotDomains`/labels de Traefik ya implementados
— pendiente que Marco cree los 3 registros DNS en Cloudflare y de la
verificación real (bloqueada por el mismo pendiente de la GitHub App).

**Dependencia real con el ticket 009** (MTA a la VM, no cerrado
todavía): `SMTP_*`/`BOUNCES_MAILDIR_PATH` quedan vacíos en dev/qa/prod
hasta que el MTA viva en esta misma VM — no bloquea el deploy (el
healthcheck es solo DB+Redis) pero el envío/procesamiento de bounces
reales no funciona todavía en esos ambientes.
