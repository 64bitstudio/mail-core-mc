# mail-core-mc

Core de envío de correo electrónico propio (in-house), pensado para que otras
apps del ecosistema (empezando por `auth-core-mc`) dejen de depender de un
proveedor externo (SES, SendGrid, etc.) para enviar correo.

## Estado

Fase 1 (núcleo transaccional) en desarrollo. Ver
`docs/definiciones/mail-core-mc-v1.md` para el alcance completo (con
VoBo del Product Owner) y `pending/`/`in-process/`/`done/` para el
avance ticket por ticket.

## Instalación / setup / arranque (backend)

Requisitos: Node.js 24+, Docker (Postgres/Redis vía `compose.yaml`).

```bash
cd backend
npm install
docker compose up -d          # Postgres + Redis (puertos efímeros — ver abajo)
```

Después de levantar Postgres/Redis, obtén sus puertos reales (Docker los
asigna al azar para no chocar con otros Postgres/Redis que ya corran en
esta máquina — ver el comentario en `backend/compose.yaml`):

```bash
docker compose port postgres 5432
docker compose port redis 6379
```

Copia `.env.example` a `.env` y pon esos puertos en `DATABASE_URL` /
`REDIS_URL`. Luego:

```bash
npx prisma migrate dev   # crea/actualiza el esquema
npm run start:dev        # http://localhost:3000
```

Verifica que todo esté conectado:
```bash
curl http://localhost:3000/health
# {"database":"ok","redis":"ok"}
```

## Tests

```bash
npm test         # unitarios
npm run test:cov # con cobertura (genera coverage/lcov.info, lo consume Sonar en CI)
npm run test:e2e
```

## CI/CD

**Corre en un self-hosted runner** registrado en esta Mac
(`~/actions-runner-mail-core-mc`), no en un runner de GitHub en la nube
— porque SonarQube vive en `http://localhost:9000` (`~/dev-infra`),
inalcanzable desde la nube. Mismo patrón que `auth-core-mc` (ver ese
repo, ticket 010, para el razonamiento completo). Consecuencia: **el CI
solo funciona mientras esta Mac esté encendida y despierta**.

Para revisar o reinstalar el runner:
```bash
cd ~/actions-runner-mail-core-mc
./svc.sh status   # ver si está corriendo
./svc.sh stop
./svc.sh start
```
Si hay que registrarlo desde cero, genera un token nuevo con
`gh api -X POST repos/marco-cortes/mail-core-mc/actions/runners/registration-token --jq '.token'`
y sigue la guía oficial de GitHub (Settings → Actions → Runners → New
self-hosted runner).

Los secretos del workflow (`SONAR_TOKEN`, `SONAR_HOST_URL`) viven en
GitHub (Settings → Secrets → Actions de este repo) — ya configurados,
reusando los mismos valores de `~/dev-infra/.env`. Las notificaciones de
Telegram no usan secrets de GitHub: `notify.sh` corre en este mismo
runner y ya tiene `~/dev-infra/.env` real en la máquina.

## Infraestructura de envío (Postfix/DKIM)

Ver `docs/ARQUITECTURA.md` — corre en Docker (`infra/mta/`), separado de
la app (`backend/`). Fase actual: desarrollo local; migración a VM real
es el ticket 009.

## Relación con otros servicios

- **auth-core-mc**: sigue siendo la fuente de verdad de identidad, permisos
  y autenticación. `mail-core-mc` es una app dependiente de `auth-core-mc`
  para autenticación/autorización de sus propios endpoints — no reimplementa
  login ni gestión de usuarios.
