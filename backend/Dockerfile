# Ticket 011: imagen Docker del backend (NestJS/Node), construida y
# ejecutada en el mismo host (la VM OCI Ampere A1.Flex, ARM64) — sin
# registry externo, mismo criterio que auth-core-mc/backend/Dockerfile
# (ticket 049): mismo host construye y despliega.
#
# node:24-slim (Debian, glibc) y NO node:24-alpine a propósito: aunque
# PrismaService usa el driver adapter (@prisma/adapter-pg, ver
# src/prisma/prisma.service.ts — "Prisma 7 ... requiere un driver
# adapter explícito", sin el query-engine nativo de Prisma en el
# runtime), el propio `prisma migrate deploy` (usado en el ENTRYPOINT de
# abajo) sigue dependiendo de un binario de motor de Prisma
# (@prisma/engines, ver "allowScripts" en package.json) — evitar de raíz
# la clase de bugs de compatibilidad musl/OpenSSL de Prisma en Alpine
# (documentados extensamente en el propio Prisma) en vez de
# diagnosticarlos en un ambiente de despliegue real. Mismo criterio que
# auth-core-mc/backend/Dockerfile, que tampoco usa la variante alpine de
# su imagen base por un motivo análogo (compatibilidad de librerías
# nativas).
#
# node:24-slim es multi-arch (amd64/arm64) — funciona igual en la Mac
# (arm64) y en la VM Ampere (arm64), sin flags de plataforma especiales.
#
# Sin ejecutar tests aquí: el stage `buildAndTest` de corePipeline
# (Jenkinsfile) ya corre npm run test:cov antes de este build de imagen
# — repetirlos aquí los correría dos veces.
FROM node:24-slim AS build
WORKDIR /app

# Copiar primero el manifiesto de dependencias — capa cacheable mientras
# no cambie, así un cambio en src/ no fuerza reinstalar node_modules.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma7.config.ts ./
# src/generated/prisma es código generado, gitignorado a propósito (ver
# sonar-project.properties, sonar.exclusions) — sin este paso el build
# falla con "Cannot find module '.../client.js'" (mismo hallazgo real
# que ya documentaba .github/workflows/ci.yml, retirado en este ticket).
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app

# curl: usado por el healthcheck de deploy/docker-compose.*.yml contra
# /health. openssl/ca-certificates: dependencia real de los binarios de
# @prisma/engines en tiempo de ejecución (migrate deploy) — node:24-slim
# no los trae por defecto.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

# node_modules COMPLETO (no "npm ci --omit=dev"): el ENTRYPOINT corre
# "npx prisma migrate deploy" contra la base persistente de cada
# ambiente antes de arrancar la app — el CLI de Prisma (paquete
# "prisma") vive en devDependencies, no en dependencies. Mismo criterio
# de simplicidad que el resto de este pipeline (ver deploy/cleanup.sh):
# correcto antes que mínimo.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma7.config.ts ./
COPY package.json ./

# Usuario no-root — la imagen nunca corre la app como root.
RUN groupadd --system app && useradd --system --gid app --no-create-home app \
    && chown -R app:app /app
USER app

EXPOSE 3000

# Migración real contra la base persistente del ambiente ANTES de
# arrancar la app — docker-compose.*.yml monta un volumen de Postgres
# por ambiente (a diferencia del Postgres efímero que usa CI/dev local,
# ver backend/compose.yaml), así que las migraciones deben aplicarse en
# cada arranque de contenedor, no asumirse ya aplicadas. Si
# "migrate deploy" falla, el contenedor no arranca (falla ruidoso, nunca
# silencioso) — el healthcheck de docker-compose lo reportará como
# unhealthy/failed, no como falso positivo.
ENTRYPOINT ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
