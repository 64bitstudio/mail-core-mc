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
