# 000 — Directiva de documentación y flujo de tareas (CONFIG GLOBAL)

**Origen:** instrucción del Product Owner, aplica a este proyecto y a todos los demás del ecosistema (ver `done/000-...` en `auth-core-mc` para el precedente).

## Qué se pidió
- Carpetas `/pending`, `/in-process`, `/done` por proyecto para rastrear tareas como archivos que se mueven de carpeta según su estado, más `/docs/definiciones` para los documentos de la fase de definición de alcance de cambios grandes.
- Carpeta `/docs` con 5 archivos vivos, actualizados como último paso obligatorio al mover una tarea a `/done`:
  - `README.md` — guía de instalación/arranque a prueba de fallos.
  - `ARQUITECTURA.md` — cómo se comunican las partes del sistema, explicado pedagógicamente.
  - `BASE_DE_DATOS.md` — esquema de tablas, relaciones, para qué sirve cada campo.
  - `API.md` — endpoints, métodos, entradas/salidas, en lenguaje simple.
  - `COMPONENTES.md` — N/A en este proyecto (no tiene UI propia).
- Redacción clara, sin dar nada por sentado, explicando el *por qué* de las decisiones técnicas, no solo el *cómo*.
- `/postman/environments` porque este proyecto es backend y expondrá endpoints.

## Contexto de este proyecto
`mail-core-mc` es un core de envío de correo electrónico propio, para que el
ecosistema (empezando por `auth-core-mc`) deje de depender de un proveedor
externo (SES/SendGrid/etc). Es una app independiente que a su vez dependerá
de `auth-core-mc` para su propia autenticación/autorización — mismo patrón
"apps dependientes" que el resto del ecosistema.

Decisiones ya tomadas con el Product Owner en el arranque de este proyecto:
- **Stack:** Node.js/TypeScript (diverge deliberadamente del stack Java/Spring
  Boot de `auth-core-mc` — decisión explícita del Product Owner, no omisión).
- **Mecanismo de envío:** SMTP relay propio (tipo Postfix) operado en la
  infraestructura propia, no delegar el último salto a un relay externo —
  es la única opción que de verdad cumple "no depender de externos". Detalle
  de diseño (colas, reputación de IP, SPF/DKIM/DMARC, manejo de bounces)
  pendiente de la fase de definición de alcance.
- **Visibilidad del repo:** privado (`github.com/marco-cortes/mail-core-mc`).

## Hecho en esta tarea
- Creado el repo `mail-core-mc` en GitHub (privado).
- Creada la estructura `/pending /in-process /done /docs /docs/definiciones /postman/environments` en este proyecto.
- Creados los 5 archivos de `/docs` con estado inicial (placeholder hasta que
  la fase de definición y los tickets de implementación generen contenido real).
- Registrado el proyecto en SonarQube (key `mail-core-mc`) e integrado el MCP de Sonar con Claude Code (`sonar integrate claude --project mail-core-mc --non-interactive`).
- **Pendiente, explícitamente diferido:** el pipeline de CI/CD (`.github/workflows/ci.yml`, notificaciones a Telegram, Quality Gate de Sonar en CI) no se creó en este bootstrap — el repo aún no tiene código (no hay `package.json` ni app Node/TS todavía), y un workflow que corra `npm ci`/tests fallaría desde el primer push. Se crea junto con el primer ticket que scaffoldee la app real, una vez la fase de definición de alcance determine el framework (Express/Fastify/NestJS/etc.) y la estructura del proyecto.
- Guardada como memoria persistente la relación de dependencia entre `mail-core-mc` y `auth-core-mc` para que futuras sesiones no la re-pregunten.
