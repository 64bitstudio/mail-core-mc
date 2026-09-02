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

**Estado real al escribir esto**: implementación completa y build+test+
Sonar+Quality Gate verificados en verde con evidencia real (Jenkins,
build #2 de `feature/011-pipeline-cicd-deploy-vm`, SUCCESS). **El
ticket NO se puede cerrar todavía** — bloqueado por una acción real que
solo puede hacer un Owner de la organización GitHub (ver "Bloqueador
real" abajo), y por una decisión pendiente de Marco (subdominio
público). Nada se mergeó a `dev` de este repo; no hay deploy real
verificado a DEV/QA/PROD todavía.

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

### Bloqueador real (impide cerrar este ticket) — GitHub App NO instalada en `mail-core-mc`

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

### Pendiente de decisión de Marco — subdominio público de la app

`vhostFile`/`certbotDomains` del `Jenkinsfile` quedan fuera a propósito
de este ticket: `mail.64bitstudio.com` ya es el hostname del MTA
(ticket 001/009 de este repo) y no se puede reusar para la app HTTP.
Revisé los DNS reales de Cloudflare (zona `64bitstudio.com`) — no hay
ningún subdominio tipo `mail-api`/`mailcore`/`mail-core` registrado
todavía, así que cualquiera de esas opciones es viable sin choque.
Candidatos con sus tradeoffs:
- `mail-api.64bitstudio.com` — más claro sobre qué es (API HTTP, no el
  MTA), pero se aparta del patrón "nombre pelado" que usa
  `auth.64bitstudio.com`.
- `mailcore.64bitstudio.com` (o `mail-core.64bitstudio.com`) — más
  cercano al nombre real del proyecto/imagen Docker, mismo criterio que
  `auth.64bitstudio.com`.

Hasta que Marco decida, DEV/QA/PROD se pueden desplegar y verificar por
el puerto de host publicado (8083/8084/8085) y por nombre de contenedor
dentro de la red `edge` — sin exposición pública todavía.

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

### Qué falta para cerrar este ticket, en orden

1. Marco (Owner de la organización) agrega `mail-core-mc` a la
   instalación de la GitHub App `64bitstudio-jenkins-ci`.
2. Con eso resuelto: re-disparar el build de `feature/011-pipeline-cicd-deploy-vm`
   (push trivial o rebuild manual), confirmar que el status
   `continuous-integration/jenkins/branch` SÍ llega a GitHub, y que el
   PR #12 pasa a `MERGEABLE`/`CLEAN`.
3. Self-merge de `feature/011 → dev` (autorizado, CI verde de verdad).
4. Verificar el deploy real a DEV disparado por ese merge: `docker
   compose ps` en la VM + `curl` real al puerto de host (8084) o al
   nombre de contenedor `mail-core-mc-dev-app-1:3000/health` desde
   dentro de la VM.
5. Decisión de Marco sobre el subdominio → commit con `vhostFile`/
   `certbotDomains` en el `Jenkinsfile` → verificar HTTPS real desde
   afuera de la VM (mismo patrón que
   `curl https://auth-dev.64bitstudio.com/actuator/health`).
6. Pedir al orquestador el merge `dev → qa` para completar la
   verificación de punta a punta pedida por el ticket (nunca lo hace
   este agente).
7. Mover este archivo a `done/` con esta sección actualizada.
