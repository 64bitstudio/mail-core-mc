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

**Implementado:**
- `TemplatesController` protegido con `@UseGuards(JwtAuthGuard,
  ScopesGuard)` + `@RequireScopes('mail:send')` en los 4 endpoints
  (`POST /`, `GET /:id`, `PATCH /:id`, `POST /:id/render`) — decisión
  confirmada por el Product Owner: un solo scope `mail:send` para todo,
  sin separar `mail:admin`.
- `TemplatesModule` importa `AuthModule` + `PassportModule.register(...)`
  (mismo gotcha de `@nestjs/passport` ya documentado en
  `EmailsModule`/`WebhooksModule`: cada módulo que usa `@UseGuards(JwtAuthGuard)`
  necesita su propia visibilidad de `AuthModuleOptions`).

**Tests:** 78/78 en verde (21 archivos, `templates.controller.spec.ts`
actualizado para overridear los guards, mismo patrón que
`webhooks.controller.spec.ts`). Cobertura: 95.37% statements / 77.77%
branches.

**Verificado en vivo, sin mocks, contra `auth-core-mc` real** (mismo
patrón que ticket 005): sin token → `401` en los 4 endpoints. Token de
`mail-core-mc-noscope-test` (client machine-to-machine sembrado a mano
en `auth-core-mc` con scope `unrelated:scope`, sin `mail:send`) → `403`
con mensaje `"Falta el scope requerido: mail:send"`. Token con
`mail:send` → `201` creando una plantilla real, `200` renderizándola —
mismo comportamiento que antes del ticket, sin regresión (dato de
prueba borrado después de verificar).

**Sin hallazgos nuevos** — a diferencia de tickets anteriores, este fue
mecánico: reutiliza el mecanismo completo del ticket 005 tal cual, sin
tocar lógica de negocio.
