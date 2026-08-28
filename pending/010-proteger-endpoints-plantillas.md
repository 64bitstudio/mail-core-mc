# 010 — Proteger `/v1/templates/**` con el mismo resource server OAuth2

## Objetivo
`POST /v1/emails` quedó protegido con el resource server OAuth2 del
ticket 005, pero `/v1/templates/**` (crear/actualizar/renderizar
plantillas, ticket 003) sigue sin ninguna autenticación — cualquiera con
acceso de red al servicio puede crear o modificar plantillas. Quedó
documentado explícitamente como pendiente al cerrar el ticket 005 (no
se agregó "de paso" para no mezclar alcances).

## Alcance
**Incluye:**
- Aplicar `@UseGuards(JwtAuthGuard, ScopesGuard)` + `@RequireScopes(...)`
  a `TemplatesController` — reusando tal cual `AuthModule` del ticket 005.
- Decidir el/los scope(s) apropiados (ej. `mail:admin` para
  crear/actualizar, quizás `mail:send` basta para el endpoint de
  render) — **pendiente de confirmar con el Product Owner**, no asumir.

**No incluye:**
- Cambios al mecanismo de autenticación en sí (ya existe, ticket 005).

## Criterios de aceptación (TDD)
- Sin token válido, ningún endpoint de `/v1/templates/**` responde con
  el contenido — `401`.
- Con token válido pero sin el scope requerido — `403`.
- Con token y scope correctos, el comportamiento es exactamente el
  mismo que hoy (sin regresión funcional).

## Hecho
