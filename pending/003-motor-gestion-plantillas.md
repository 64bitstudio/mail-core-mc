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
  ticket 004 — por ahora quedan protegidos por el mismo resource server
  cuando exista, pero la lógica de auth no es parte de este ticket).
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
