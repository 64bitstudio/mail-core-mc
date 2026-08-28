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
