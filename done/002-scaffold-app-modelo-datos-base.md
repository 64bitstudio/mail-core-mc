# 002 — Scaffold de la app y modelo de datos base

## Objetivo
Crear el esqueleto real de `mail-core-mc` (NestJS + PostgreSQL + Redis +
Prisma, según el diseño técnico acordado) y el modelo de datos base
(tenants, templates, messages, suppression) sobre el que se construyen
los tickets siguientes de la Fase 1. Nace de la sección "Diseño técnico"
de `docs/definiciones/mail-core-mc-v1.md`.

## Alcance
**Incluye:**
- Proyecto NestJS con estructura de módulos (sin lógica de negocio real
  todavía, solo el esqueleto: módulos vacíos para `emails`, `templates`,
  `auth`, `webhooks`).
- Prisma configurado contra PostgreSQL, con la primera migración creando:
  `Tenant`, `Template`, `Message` (con `status`, `type`), y
  `SuppressionEntry` (los mínimos que HU-1 a HU-6 necesitan; `Contact`,
  `List`, `Segment`, `Campaign` quedan para la Fase 3).
- Redis + BullMQ configurados (sin colas reales todavía, solo la conexión
  y el health check).
- `docker-compose.yml` local (app + Postgres + Redis), siguiendo la misma
  convención que `compose.yaml` en `auth-core-mc`.
- CI/CD (`.github/workflows/ci.yml`): build + test + Quality Gate de
  SonarQube + notificación a Telegram, ahora que ya existe código real
  que compilar (diferido intencionalmente durante el bootstrap, ver
  `done/000-...md`).
- Actualiza `docs/README.md` (instalación/arranque real) y
  `docs/BASE_DE_DATOS.md` (esquema de las 4 tablas iniciales).

**No incluye:**
- Ningún endpoint HTTP real todavía (eso es el ticket 003).
- Contactos/listas/segmentos/campañas (Fase 3).

## Criterios de aceptación (TDD)
- Dado el repo recién clonado, cuando se sigue `docs/README.md`, entonces
  la app levanta localmente con `docker-compose up` sin pasos manuales
  adicionales.
- Dado un push a cualquier rama, cuando corre el pipeline de CI, entonces
  build + tests + Quality Gate de Sonar pasan en verde y llega la
  notificación a Telegram.
- Dado el esquema de Prisma, cuando se corre la migración inicial,
  entonces las tablas `Tenant`, `Template`, `Message`,
  `SuppressionEntry` quedan creadas con los campos descritos en
  `docs/BASE_DE_DATOS.md`.

## Hecho

- Proyecto NestJS (`backend/`, Node 24, TypeScript, vitest) con módulos
  vacíos `emails`, `templates`, `auth`, `webhooks`, más `prisma` (wrapper
  inyectable de `PrismaClient`, ciclo de vida conectado a Nest) y
  `health` (endpoint `GET /health` con ping real a Postgres y Redis —
  probado en vivo, responde `{"database":"ok","redis":"ok"}`).
- Prisma 7 + PostgreSQL: migración inicial (`prisma/migrations/20260828002433_init`)
  con `Tenant`, `Template`, `Message`, `SuppressionEntry` — aplicada y
  verificada contra una base real. Prisma 7 requiere un *driver adapter*
  explícito (`@prisma/adapter-pg`) para el cliente en runtime — no estaba
  anticipado en el ticket, documentado aquí para quien toque Prisma
  después.
- Redis + BullMQ configurados vía `BullModule.forRoot` (conexión real
  verificada por el health check; sin colas/jobs reales todavía, eso es
  el ticket 004).
- `backend/compose.yaml` (Postgres + Redis, puertos efímeros — mismo
  gotcha de colisión de puerto 5432 ya documentado en `auth-core-mc`).
- `.github/workflows/ci.yml`: build + tests con cobertura (`vitest` +
  `@vitest/coverage-v8` → `lcov.info`) + análisis y Quality Gate de
  SonarQube + notificación a Telegram. **Runner self-hosted nuevo
  registrado** (`~/actions-runner-mail-core-mc`, con VoBo explícito del
  Product Owner por ser un servicio persistente nuevo en la máquina) y
  secrets `SONAR_TOKEN`/`SONAR_HOST_URL` configurados en el repo.
- `docs/README.md` y `docs/BASE_DE_DATOS.md` actualizados con la
  instalación real y el esquema de las 4 tablas.
- **Decisión tomada en el camino:** se quitó `@nestjs/mau` (dependencia
  por defecto del scaffold de Nest, para su servicio de deploy en la
  nube que no usamos) porque traía una vulnerabilidad alta sin fix
  disponible más que forzar una versión vieja — no aplica en nuestro
  caso porque no usamos Mau para nada.
- **Vulnerabilidades de `npm audit` no resueltas, documentadas a
  propósito:** 3 altas en `deepmerge-ts` (vía `@prisma/config`), solo
  alcanzable desde el CLI de Prisma en desarrollo, nunca desde el
  código de producción. La única corrección que ofrece `npm audit fix`
  es *bajar* la versión de Prisma, no un parche real — se dejó como
  está en vez de downgradear.
- **Pendiente de confirmar en este mismo PR:** el criterio de aceptación
  de "CI en verde" se valida contra el pipeline real corriendo en el
  runner nuevo, no solo localmente — ver el resultado del PR antes de
  dar esto por cerrado del todo.
