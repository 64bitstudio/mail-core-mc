# 003 — Motor y gestión de plantillas

## Objetivo
Permitir crear/actualizar plantillas HTML con variables y renderizarlas,
para que el correo transaccional (ticket 005) tenga algo que enviar sin
que cada app llamante mande su propio HTML. Nace de HU-2 en
`docs/definiciones/mail-core-mc-v1.md`.

## Alcance
**Incluye:**
- Endpoint para crear/actualizar plantillas (`template_id`, `subject`,
  `html_body` con placeholders `{{variable}}`, versionado simple).
- Motor de renderizado (Handlebars) que sustituye variables al momento
  del envío.
- Validación de variables: si el envío no provee todas las variables que
  la plantilla espera, falla explícitamente (ver criterios).

**No incluye:**
- Autenticación/autorización de estos endpoints (se resuelve en el
  ticket 005 — corrección: el ticket original decía "004", que es la
  cola transaccional, no auth; por ahora quedan sin protección real,
  pendiente de que 005 los envuelva con el resource server).
- Variables anidadas o bloques `{{#each}}`/`{{#if}}` — v1 solo soporta
  sustitución plana de variables top-level (`{{nombre}}`), que es lo que
  HU-1/HU-2 necesitan realmente (verificación, reset, 2FA). Documentado
  aquí como limitación explícita, no como omisión silenciosa.
- Editor visual (fuera de alcance de todo el proyecto, ver documento de
  definición).

## Criterios de aceptación (TDD)
- Dado un HTML con `{{nombre}}` y `{{link}}`, cuando se crea la
  plantilla, entonces queda disponible por `template_id` y versionada.
- Dado un envío con `template_id` válido y todas las variables
  requeridas, cuando se renderiza, entonces el HTML resultante tiene los
  placeholders correctamente sustituidos.
- Dado un envío que omite una variable requerida por la plantilla,
  entonces la operación falla con un error claro ("falta la variable
  X") antes de intentar cualquier envío — nunca se manda un correo con
  placeholders sin sustituir.

## Hecho

- `TemplatesModule` completo: `POST /v1/templates` (crear), `GET /v1/templates/:id`,
  `PATCH /v1/templates/:id` (siempre incrementa `version`), y
  `POST /v1/templates/:id/render` (endpoint de conveniencia, reutiliza
  el mismo `TemplatesService.render()` que usará el ticket 005).
- Extracción de variables requeridas vía el AST real de Handlebars
  (`Handlebars.parse`), no regex — evita falsos positivos con texto/HTML
  incidental. Documentada la limitación v1: solo variables planas
  top-level, no dentro de `{{#each}}`/`{{#if}}`.
- El body se renderiza con HTML-escaping automático (Handlebars default,
  `{{var}}` no `{{{var}}}`); el subject no se escapa (`noEscape: true`,
  es texto plano, no HTML) — probado explícitamente que una variable con
  `<script>` no se inyecta cruda en el HTML final.
- 9 tests unitarios en verde (`templates.service.spec.ts`), cubriendo
  los 3 criterios de aceptación directamente, más versionado y
  not-found. Verificado también en vivo contra la API real corriendo
  (`curl`): crear → render con todas las variables (AC2) → render con
  una variable faltante, `400` con mensaje claro antes de intentar nada
  (AC3) → actualizar, versión sube de 1 a 2 (AC1).
- `ValidationPipe` global agregado en `main.ts` (faltaba desde el
  ticket 002 — sin esto los DTOs de `class-validator` no validaban
  nada, se hubiera notado hasta este ticket).
- `docs/API.md` documentado con los 4 endpoints nuevos.
- **Bug real de infraestructura encontrado y corregido en el camino,
  fuera del alcance original de este ticket:** el hook global
  `silent-failure-guard.sh` bloqueaba con falsos positivos cualquier
  `catch`/`ExceptionFilter` multilínea bien logueado (un bug de parsing
  — `pcre_extract` producía un match multilínea correcto, pero el
  consumidor lo partía línea por línea con `while read`, evaluando cada
  línea física por separado). Corregido con VoBo del Product Owner
  (separador NUL + lectura vía sustitución de proceso, compatible con
  bash 3.2 de macOS que no tiene `mapfile`) — verificado que sigue
  bloqueando un catch realmente silenciado. Reportado también como
  feedback del producto.


