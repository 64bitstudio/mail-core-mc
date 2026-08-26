# 008 — Cutover: auth-core-mc migra a mail-core-mc

## Objetivo
Cerrar el objetivo de negocio original del proyecto: que `auth-core-mc`
deje de depender de un proveedor externo de correo y use `mail-core-mc`
para verificación de cuenta, reset de password y 2FA por correo. Nace de
la sección "Objetivo de negocio" y HU-7 en
`docs/definiciones/mail-core-mc-v1.md`. Depende de que los tickets 001 a
007 estén cerrados y validados en producción.

## Alcance
**Incluye:**
- Checklist de salida (definition of done) de la Fase 1 completa, del
  lado de `mail-core-mc`: infra validada (SPF/DKIM/DMARC en verde),
  API/plantillas/cola/bounces/webhooks funcionando de punta a punta con
  al menos un envío real de prueba.
- Coordinación con el ticket correspondiente en `auth-core-mc` (a crear
  en ese repo, fuera de este, cuando este cutover esté listo para
  ejecutarse) que reemplaza las llamadas al proveedor externo por
  llamadas a `mail-core-mc`.
- **Cambio que rompe compatibilidad para auth-core-mc** (deja de usar su
  proveedor actual): requiere VoBo dedicado del Product Owner antes de
  ejecutar el cutover en producción, aparte del VoBo ya dado sobre el
  documento de definición — no se ejecuta "de paso" dentro de otro
  ticket.
- Es **corte directo (cutover) sin fallback**, según decisión ya tomada
  con el Product Owner — no hay retorno automático al proveedor externo
  si algo sale mal. Monitoreo intensivo de bounce/entrega en los
  primeros días, con procedimiento manual de reversión documentado de
  antemano (ver "Riesgos" en el documento de definición).

**No incluye:**
- El código de `mail-core-mc` en sí (tickets 001-007).
- La implementación del lado de `auth-core-mc` (vive como ticket propio
  en ese repo, referenciando este documento de definición).

## Criterios de aceptación (TDD)
- Dado los tickets 001-007 cerrados, cuando se corre la checklist de
  salida de Fase 1, entonces todos los ítems quedan en verde (infra +
  API + plantillas + cola + bounces + webhooks probados de punta a
  punta).
- Dado el VoBo dedicado del Product Owner para el cutover, cuando se
  ejecuta, entonces `auth-core-mc` envía verificación/reset/2FA vía
  `mail-core-mc` y dichos correos llegan correctamente a bandeja de
  entrada (no spam) en una prueba real.
- Dado el monitoreo de los primeros días post-cutover, entonces la tasa
  de bounce/entrega se documenta y no dispara ninguna alerta de
  reputación grave (blacklist, tasa de bounce anormal).

## Hecho
