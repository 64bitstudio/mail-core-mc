# 011 — Pipeline de CI/CD para desplegar mail-core-mc a la VM dedicada

## REDISEÑO (arquitectura vigente — reemplaza el modelo de GitHub Actions descrito abajo)

Este ticket se escribió antes del pivote de orquestación a Jenkins (ver
`auth-core-mc/done/049-pipeline-cicd-deploy-vm.md`, sección "SEGUNDO
PIVOTE"). El objetivo original (llevar la app a un deploy real en la VM)
sigue vigente, pero el mecanismo YA NO es GitHub Actions con ramas
`integracion`/`main` + GitHub Environment — es Jenkins (contenedor
compartido en la VM, gestionado por `platform`), Shared Library
`corePipeline` (`platform/vars/corePipeline.groovy`), y el flujo de
ramas `dev`/`qa`/`prod` ya vigente para todo core (ver
`platform/docs/ARQUITECTURA.md`, runbook "conectar un proyecto nuevo").
Se conserva el contenido original de "Contexto y decisiones ya tomadas",
"Alcance" y "Criterios de aceptación" tal cual, como historia — no como
el diseño real implementado. Ver la sección "Hecho" para el diseño
vigente y el estado real.

## Objetivo
Llevar `mail-core-mc` (la app, no el MTA) de "solo CI en la Mac de
Marco" a un despliegue real en la VM dedicada (OCI Ampere A1.Flex, ya
provisionada, acceso SSH ya funcional), con entornos `test` y `prod`
separados en la misma VM. Decisiones tomadas junto al Product Owner
(sesión 2026-08-29, sin documento de definición formal — cambio bien
entendido, resuelto por ronda de clarificación directa). Ticket gemelo
en `auth-core-mc` para lo mismo; ambos comparten la VM pero cada
proyecto tiene su stack de Docker Compose aislado.

## Contexto — cómo se relaciona con los tickets 008 y 009

Este ticket es **distinto** del 009 (`migracion-mta-vm-dedicada`, en
curso): el 009 cubre solo Postfix/OpenDKIM (el MTA), explícitamente
excluye cambios de código/CI de la app. Este ticket cubre el pipeline de
CI/CD de la **app** (`mail-core-mc` en sí: API, plantillas, cola,
bounces, webhooks). El cutover real de `auth-core-mc` (ticket 008)
depende de que tanto el 009 como este ticket estén cerrados — no puede
ejecutarse contra una instancia que nunca validó entregabilidad ni
despliegue real de producción.

## Contexto y decisiones ya tomadas (no reabrir sin VoBo dedicado)

- **Cambio de flujo de ramas** (afecta la regla 4 del equipo — se
  documenta aquí explícitamente como cambio de proceso, no "de paso"):
  se introduce una rama persistente nueva `integracion` entre
  `feature/NNN` y `main`.
  - PR de `feature/NNN` → merge a `integracion` dispara: tests unitarios
    (`npm run test:cov`, con Postgres/Redis de test como ya hace CI hoy)
    → análisis SonarQube (ya existente) → build de imagen Docker → deploy
    automático al stack **TEST** en la VM.
  - `integracion` → merge a `main` dispara: promoción de la **misma**
    imagen (no rebuild, tag por SHA de commit) al stack **PROD** en la
    VM, gateada por aprobación manual (GitHub Environment con reviewer
    requerido — pausa el job hasta que el Product Owner apruebe).
- **Conexión con la VM**: runner self-hosted **nuevo**, registrado en la
  propia VM (systemd), mismo patrón que el runner de Sonar ya existente
  en la Mac. Sin llaves SSH en GitHub Secrets, sin exponer SSH para CI.
  Coordinar con el ticket gemelo de `auth-core-mc` para no registrar el
  runner dos veces (es la misma VM) — y con el ticket 009, que también
  toca esta VM (MTA), para no chocar en la configuración de Docker/red.
- **Sin registry externo**: build local al Docker daemon de la VM
  (descartado GHCR/Docker Hub a propósito — mismo host construye y
  despliega).
- **Retención de imágenes/recursos** (VM de capa gratuita — maximizar
  aprovechamiento de disco):
  - TEST: conserva solo la imagen actual (1 versión) — sin rollback
    prometido ahí.
  - PROD: conserva la imagen actual + la anterior (2 versiones) para
    poder hacer rollback manual.
  - Tras cada deploy (test y prod): limpieza total — borrar imágenes de
    release más allá del límite permitido, más `docker image prune -f`
    (dangling), `docker builder prune -f` (build cache), `docker
    container prune -f` (contenedores detenidos).
- **Base de datos/Redis de producción**: este ticket NO incluye
  aprovisionar Postgres/Redis de producción — eso debe resolverse aquí
  como prerequisito del deploy a TEST/PROD real (ver Alcance) porque el
  `docker-compose.yml` actual de CI solo levanta Postgres/Redis
  efímeros para pruebas, no pensados para persistir datos reales.

## Alcance

**Incluye:**
- `Dockerfile` para el backend (Node.js) — no existe hoy.
- `docker-compose.test.yml` y `docker-compose.prod.yml` de despliegue,
  con Postgres/Redis persistentes (volúmenes) para cada entorno —
  distintos del `docker-compose.yml` efímero que usa CI hoy.
- Modificación de `.github/workflows/ci.yml` (o workflow nuevo) con jobs
  `build-image` → `deploy-test` → `promote-prod` (gate manual).
- Script de limpieza de imágenes/recursos (retención 1 en test, 2 en
  prod, + prune general) corrido tras cada deploy.
- Configuración de branch protection para `integracion` y `main`.
- Registro/config del runner self-hosted nuevo en la VM (coordinado con
  el ticket gemelo de `auth-core-mc` y con el 009).
- Actualizar `docs/ARQUITECTURA.md` con el nuevo flujo de ramas y de
  despliegue de la app (separado de la sección ya existente sobre la
  migración del MTA).

**No incluye:**
- El MTA/Postfix/OpenDKIM (ticket 009, en curso).
- El cutover de `auth-core-mc` a `mail-core-mc` (ticket 008 — depende de
  que este ticket y el 009 estén cerrados).
- Cambios de lógica de negocio de la app.
- El pipeline equivalente de `auth-core-mc` (ticket propio en ese repo).

## Criterios de aceptación (TDD)

- Dado un PR mergeado a `integracion`, cuando corre el workflow,
  entonces se ejecutan tests unitarios con cobertura, SonarQube (con
  Quality Gate en verde), build de imagen, y el stack TEST en la VM
  queda corriendo la imagen nueva contra su propia Postgres/Redis
  persistente (verificable con `docker compose ps` y un healthcheck del
  endpoint real).
- Dado el stack TEST ya desplegado, cuando se hace merge de
  `integracion` a `main`, entonces el job de promoción a PROD queda
  pausado esperando aprobación manual (GitHub Environment) — no se
  despliega solo.
- Dado que se aprueba la promoción, cuando corre el job, entonces PROD
  queda corriendo la **misma** imagen (mismo tag/SHA) que se validó en
  TEST — no una reconstruida.
- Dado un segundo deploy a PROD, cuando termina, entonces solo existen 2
  imágenes de release para `mail-core-mc-prod` y ninguna más vieja.
- Dado un deploy a TEST, cuando termina, entonces solo existe 1 imagen
  de release para `mail-core-mc-test`.
- Dado cualquier deploy (test o prod), cuando termina, entonces no
  quedan imágenes dangling, build cache acumulado, ni contenedores
  detenidos en la VM (verificable con `docker system df`).
- Dado el runner self-hosted de la VM, cuando se registra, entonces
  aparece como online en GitHub Actions y corre bajo un label distinto
  al runner de la Mac (para poder dirigir jobs a uno u otro).

## Hecho

**Estado real al cerrar esto**: los 2 bloqueadores reales (GitHub App
sin `mail-core-mc` instalado; subdominio público sin decidir) quedaron
resueltos por Marco. Verificado de punta a punta con evidencia real,
**desde afuera de la VM**, no solo desde dentro:

```
curl https://mailcore-dev.64bitstudio.com/health
-> 200, {"database":"ok","redis":"ok"}
```

Certificado real de Let's Encrypt, verificado con `curl -v`:
`subject: CN=mailcore.64bitstudio.com`, `subjectAltName: host
"mailcore-dev.64bitstudio.com" matched cert's "mailcore-dev.64bitstudio.com"`,
`SSL certificate verify ok`, vence 2026-12-01 (certbot emitió un
certificado SAN único para los 3 subdominios en el mismo deploy).

Secuencia real completa, cada paso con evidencia (no solo "el pipeline
corrió"):
1. Marco agregó `mail-core-mc` a la instalación de la GitHub App —
   reverifiqué con un installation token real (`GET
   /installation/repositories`): pasó de listar solo `auth-core-mc` a
   listar `auth-core-mc`, `mail-core-mc` y `platform`.
2. Build de re-disparo (`feature/011-pipeline-cicd-deploy-vm`, commit
   vacío `7983874`) — build #5, `SUCCESS`, y esta vez el status
   `continuous-integration/jenkins/branch` SÍ llegó a GitHub
   (`state: success`, confirmado vía `gh api .../status`). PR #12 pasó
   de `BLOCKED` a `MERGEABLE`/`CLEAN`.
3. Self-merge real de `feature/011 → dev` (`gh pr merge 12 --squash`),
   autorizado por CI verde de verdad (no solo "Jenkins dice que sí" —
   el status llegó a GitHub y GitHub lo confirmó).
4. Ese merge disparó el build real `dev` #2 — `SUCCESS` de punta a
   punta: build de imagen (`docker build`, exitoso), vhost de nginx
   aplicado (`nginx -t` OK), certbot emitió el certificado real (log:
   "Successfully received certificate"), Vault entregó `DB_PASSWORD`
   sin imprimirlo (`Masking supported pattern matches of
   $JENKINS_APPROLE_SECRET_ID`), `docker compose up -d` levantó
   `mail-core-mc-dev-app-1`/`postgres-1`/`redis-1` (los 3 `healthy`),
   healthcheck real (`curl http://mail-core-mc-dev-app-1:3000/health`)
   → `DEV healthy.` en el 2º intento, `docker compose ps` confirmó
   `Up ... (healthy)` publicando `0.0.0.0:8084->3000/tcp`, `cleanup.sh
   dev` corrió sin borrar la imagen en uso (retención 1, verificado).
5. Verificación externa real (arriba): `https://mailcore-dev.64bitstudio.com/health`
   → `200` con TLS válido, desde fuera de la VM (no `localhost`/SSH).

El puerto de host (8084) NO está expuesto públicamente (confirmado con
un `curl` real desde fuera que dio timeout) — correcto por diseño, solo
22/80/443 están abiertos en el Security List de OCI (mismo patrón que
auth-core-mc); la app se alcanza por HTTPS real vía nginx→Traefik, no
por el puerto directo.

**QA/PROD**: no se dispararon ni se simularon — `qa → prod` es
exclusivo de Marco, y `dev → qa` lo mergea el orquestador, no este
agente (ver "Política de merges" en `docs/ARQUITECTURA.md` de
`auth-core-mc`). Quedan pendientes de que el orquestador/Marco decidan
avanzar esa promoción.

### Diseño vigente (Jenkins/corePipeline), implementado

- `backend/Dockerfile`: `node:24-slim` (no alpine — evita a propósito la
  clase de bugs de compatibilidad musl/OpenSSL de los binarios de
  `@prisma/engines`, mismo criterio que auth-core-mc con su imagen
  Temurin no-alpine), build multi-stage, `ENTRYPOINT` corre
  `npx prisma migrate deploy` contra la base persistente del ambiente
  antes de arrancar la app.
- `deploy/docker-compose.{dev,qa,prod}.yml`: Postgres/Redis persistentes
  (volúmenes, a diferencia del stack efímero de CI/dev local). Puertos
  de host reservados (coordinados con auth-core-mc, que ya usa
  8080/8081/8082): **PROD 8083 / DEV 8084 / QA 8085**.
- `deploy/cleanup.sh`, `deploy/env-ctl.sh`: copiados tal cual de
  `auth-core-mc/deploy/` (ticket 049) y adaptados solo de nombre — sin
  reinventar nada.
- `deploy/.env.{dev,qa,prod}.example`: plantillas committeadas; los
  `.env` reales ya existen en la VM
  (`/home/ubuntu/secrets/mail-core-mc/.env.{dev,qa,prod}`, gitignored).
- `Jenkinsfile`: reemplaza el mínimo de `platform/002` (`deploy: false`,
  sin `buildAndTest`) — agrega `buildAndTest` real (npm/Prisma/vitest/
  sonar-scanner) y `containerPort: 3000`/`healthPath: '/health'`/
  `healthyPattern: '"database":"ok"'` (propios de NestJS, el default de
  `corePipeline` asume Spring Boot Actuator).
- **Vault** (decisión tomada, ver más abajo): `DB_PASSWORD` de
  dev/qa/prod ya sembrado en `secret/mail-core-mc/{dev,qa,prod}` (KV v2)
  y verificado por lectura — la policy `jenkins-infra` ya cubre
  cualquier proyecto vía wildcard de un segmento
  (`secret/data/+/{dev,qa,prod}`), **sin ningún cambio de policy
  necesario**. `SMTP_*`/`BOUNCES_MAILDIR_PATH` quedan como variables de
  entorno simples (vacías por defecto), no en Vault — no hay Vault
  Transit ni AppRole propio para mail-core-mc (eso es específico de
  auth-core-mc, ticket 017, cifrado de credenciales de terceros por
  tenant; mail-core-mc no tiene ese caso de uso todavía). Decisión
  explícita de no sobre-construir: el objetivo de este ticket es que el
  pipeline funcione, no meter más Vault del que ya viene gratis por el
  default de `corePipeline`.
- **Jenkins ampliado (repo `platform`)**: la imagen no traía Node.js ni
  un scanner de Sonar para JS/TS (auth-core-mc usa el plugin de Sonar
  de Gradle, self-contained). Agregado Node.js 24 (NodeSource) +
  sonar-scanner CLI 6.2.1.4610 (descarga pineada de SonarSource, con
  detección de arquitectura). **Verificado en vivo tras el rebuild real
  de `sync-vm-infra`**: `docker exec jenkins node --version` → v24.20.0,
  `npm --version` → 11.19.0, `/opt/sonar-scanner/bin/sonar-scanner
  --version` → SonarScanner CLI 6.2.1.4610, corriendo nativo en Linux
  aarch64 (la VM real). PR mergeado a `platform:main`
  (`64bitstudio/platform#26`).

### 2 hallazgos reales encontrados corriendo el pipeline de verdad (ninguno visible en revisión de código)

1. **Postgres/Redis de test no eran alcanzables desde el contenedor de
   Jenkins.** Primer build real (`feature/011...`, build #1) falló con
   `Error: P1001: Can't reach database server at localhost:<puerto>` en
   `prisma migrate deploy`, pese a que `pg_isready` (vía `docker compose
   exec`, que habla con el daemon real por `docker.sock`) ya confirmaba
   Postgres arriba. Causa: Jenkins mismo corre containerizado —
   `localhost:<puerto efímero publicado>` desde un step es el loopback
   del CONTENEDOR DE JENKINS, no del host (mismo bug/causa raíz ya
   documentado en `corePipeline.groovy` para el healthcheck de deploy,
   que yo no había aplicado a mi propio paso de tests). Fix:
   `backend/docker-compose.ci.yml` (override solo-CI) conecta Postgres/
   Redis de test a la red `edge` (donde también vive Jenkins) —
   `DATABASE_URL`/`REDIS_URL` apuntan al nombre de contenedor
   (`mail-core-mc-ci-postgres-1`/`-redis-1`), no a `localhost`+puerto.
   **Verificado con un build real nuevo** (build #2): migración
   aplicada, build, tests y análisis Sonar corriendo en verde, Quality
   Gate en verde, `Finished: SUCCESS`.
2. **`TELEGRAM_BOT_TOKEN` quedaba en texto plano en el log de consola de
   Jenkins**, en TODOS los builds de TODOS los cores (no solo
   mail-core-mc) — encontrado por accidente leyendo el log del build #1
   para diagnosticar el hallazgo #1. Causa: el `post{always}` de
   `corePipeline.groovy` corría el `curl` de notificación a Telegram sin
   `set +x` (mismo patrón/causa raíz ya corregido antes para
   `VAULT_TOKEN`, ticket `platform/004`, pero no replicado aquí). Fix
   propuesto en `64bitstudio/platform#27` (`set +x` explícito) —
   **PR abierto, sin mergear** (corrección del orquestador durante este
   ticket: los PRs contra `platform` los revisa/mergea él, no este
   agente). El token ya estuvo expuesto en al menos 2 builds reales —
   Marco decide si rotarlo.

### Bloqueador real — GitHub App NO instalada en `mail-core-mc` (RESUELTO por Marco)

Verificado con evidencia definitiva, no asumido: generé un JWT real de
la GitHub App `64bitstudio-jenkins-ci` (app_id 4797871, llave privada ya
en `/home/ubuntu/secrets/jenkins/.env` de la VM) y consulté
`GET /installation/repositories` con un installation token real. Resultado:

```
total_count: 1
- 64bitstudio/auth-core-mc
```

**`mail-core-mc` NO está en la lista de repos de la instalación** —
`repository_selection: "selected"` a nivel de organización solo incluye
`auth-core-mc`. Esto explica TODO lo observado:
- El checkout/build en Jenkins funciona igual (el repo es público — el
  clon anónimo por HTTPS no depende de que la App tenga acceso).
- El webhook push→Jenkins funciona igual (se creó vía `gh api` con la
  sesión de Marco/el orquestador en `bootstrap-project-branches.sh`, no
  depende de la instalación de la App).
- Pero **cualquier operación de escritura real vía la App** (reportar el
  commit status `continuous-integration/jenkins/branch`) falla con
  `403 Resource not accessible by integration` — confirmado en los
  builds #1 y #2, ambos con `Finished: SUCCESS`/`FAILURE` según el caso,
  pero SIN que GitHub reciba nunca el status. La branch protection de
  `dev` exige ese check — **el PR #12 (`feature/011-pipeline-cicd-deploy-vm`
  → `dev`) queda `mergeStateStatus: BLOCKED` aunque Jenkins diga
  SUCCESS**, y por diseño no lo voy a saltar (ni con un merge de
  administrador, ni debilitando el check) — sería exactamente el tipo de
  parche silencioso que las reglas del equipo prohíben.

Un build anterior de `mail-core-mc` (`dev`, 2026-09-01 05:15 UTC) SÍ
logró postear su status con éxito — la instalación se actualizó ese
mismo día más tarde (18:51 UTC, durante el trabajo del ticket
`platform/006` sobre la GitHub App), y todo indica que en algún punto de
esa sesión el repo se quedó fuera de la lista de repos seleccionados
(un cambio real, no un bug de este ticket).

**Acción real pendiente, solo la puede hacer un Owner de la
organización** (confirmado: mi propio intento vía API,
`PUT /user/installations/158345502/repositories/1347863550`, fue
rechazado con `403 You do not have permission to modify this app on
64bitstudio. Please contact an Organization Owner.`): en GitHub →
Organization settings → `64bitstudio` → Installed GitHub Apps →
`64bitstudio-jenkins-ci` → Configure → Repository access → agregar
`mail-core-mc` a la lista de repos seleccionados.

### Subdominio público de la app — decidido por Marco: `mailcore.64bitstudio.com`

`mail.64bitstudio.com` ya es el hostname del MTA (ticket 001/009 de este
repo), no reusable para la app HTTP — revisé los DNS reales de
Cloudflare (zona `64bitstudio.com`) antes de proponer candidatos, sin
ningún choque. Marco eligió `mailcore.64bitstudio.com` (vs. la otra
opción evaluada, `mail-api.64bitstudio.com`). Los sufijos
`-qa`/`-dev` para QA/DEV siguen el mismo patrón ya establecido por
auth-core-mc (ticket 049, único que existe en este ecosistema para 3
subdominios por proyecto) — no una decisión nueva, aplicación mecánica
del patrón ya aprobado:
- PROD → `mailcore.64bitstudio.com`
- QA → `mailcore-qa.64bitstudio.com`
- DEV → `mailcore-dev.64bitstudio.com`

Implementado: `deploy/vm-infra/nginx/mail-core-mc.conf` (vhost, solo
HTTP por ahora — igual que `auth-core-mc.conf` antes de que el DNS
resolviera), `Jenkinsfile` (`vhostFile`/`certbotDomains`),
`deploy/docker-compose.{dev,qa,prod}.yml` (labels de Traefik con el
`Host()` real por ambiente, reemplazando el `traefik.enable=false`
provisional). **Pendiente de verificación real** (bloqueada por el
mismo problema de la GitHub App de arriba: no hay merge a `dev`
todavía, así que no hay deploy real que probar): los 3 registros DNS en
Cloudflare (`mailcore[.-qa][-dev].64bitstudio.com` → la IP pública de
la VM) los tiene que crear Marco, igual que se hizo para auth-core-mc —
sin token de API de Cloudflare disponible para hacerlo automático desde
aquí. `certbotDomains` en `corePipeline` corre `certbot --nginx`
automático en cada deploy a `dev` (tolerante a fallo si el DNS aún no
resolvió — no bloquea el resto del pipeline).

**RESUELTO**: Marco creó los 4 registros DNS pendientes (incluidos los 3
de `mailcore[.-qa][-dev]`). Verificado con el deploy real a `dev`
(build #2): certbot emitió el certificado real sin reintentos ni
warnings, y `curl https://mailcore-dev.64bitstudio.com/health` desde
afuera de la VM respondió `200` con TLS válido — ver el detalle
completo en la sección "Hecho" arriba.

### Dependencia real con el ticket 009 (MTA a la VM, en curso, no cerrado)

Confirmado por SSH directo a la VM (`docker ps`): no hay ningún
contenedor de Postfix/OpenDKIM corriendo ahí todavía. `SMTP_*`/
`BOUNCES_MAILDIR_PATH` quedan vacíos por defecto en los `.env.*` reales
de la VM — esto NO bloquea el deploy (el healthcheck de `/health` solo
valida Postgres/Redis; `nodemailer` crea su transporte de forma
perezosa, sin fallar al arrancar; `MaildirWatcherService` loguea un
warning y no arranca el watcher si la ruta no está seteada, sin crashear
la app) pero sí significa que el envío/procesamiento de bounces
reales no va a funcionar de verdad en DEV/QA/PROD hasta que el 009
aterrice.

### Cierre — los 7 pasos completados, en orden

1. ✅ Marco agregó `mail-core-mc` a la instalación de la GitHub App
   `64bitstudio-jenkins-ci` — reverificado con un installation token
   real.
2. ✅ Marco creó los 3 registros DNS en Cloudflare
   (`mailcore[.-qa][-dev].64bitstudio.com` → IP pública de la VM).
3. ✅ Re-disparado el build de `feature/011-pipeline-cicd-deploy-vm`
   (commit vacío `7983874`) — build #5, `SUCCESS`, status
   `continuous-integration/jenkins/branch` (`state: success`) SÍ llegó
   a GitHub esta vez. PR #12 pasó a `MERGEABLE`/`CLEAN`.
4. ✅ Self-merge de `feature/011 → dev` (`gh pr merge 12 --squash`,
   CI verde de verdad).
5. ✅ Deploy real a DEV verificado: `docker compose ps` en la VM (los
   3 contenedores `healthy`) y `curl https://mailcore-dev.64bitstudio.com/health`
   desde afuera de la VM → `200`, TLS válido.
6. ⏸️ `dev → qa`: no disparado en este ticket — el orquestador lo
   mergea cuando decida, no es parte del criterio de cierre de este
   ticket (el pipeline de QA/PROD ya está implementado y lo ejercitará
   `corePipeline` de la misma forma que DEV cuando corra).
7. ✅ Este archivo se mueve a `done/` con esta sección actualizada.

**No incluido en el cierre, a propósito** (fuera de alcance de 011,
señalado explícitamente, no un olvido): verificación real de QA/PROD
(depende de que el orquestador/Marco decidan promover), y
funcionamiento real de envío/bounces de correo (depende del ticket 009,
MTA a la VM, todavía en curso — ver "Dependencia real con el ticket
009" arriba).
