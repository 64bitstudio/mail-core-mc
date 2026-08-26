# Arquitectura — mail-core-mc

## Qué es

Servicio propio de envío de correo electrónico ("mail core"), construido
para que el ecosistema (empezando por `auth-core-mc`) no dependa de un
proveedor externo (SES, SendGrid, Mailgun, etc.) para enviar correo.

## Relación con auth-core-mc y otras apps

`mail-core-mc` y `auth-core-mc` son servicios independientes y desplegables
por separado:

- **auth-core-mc** sigue siendo el dueño de identidad, sesiones, permisos y
  autenticación para todo el ecosistema.
- **mail-core-mc** es una app *dependiente* de `auth-core-mc` para todo lo
  que es AuthN/AuthZ de sus propios endpoints (igual que cualquier otra app
  del ecosistema) — no reimplementa login, usuarios ni permisos.
- Después de este bootstrap, `auth-core-mc` pasará a consumir `mail-core-mc`
  para el envío de los correos que hoy dependen de un tercero (verificación
  de cuenta, reseteo de password, 2FA por correo, etc.).

## Decisiones de arquitectura

_Pendiente — se documentan aquí conforme la fase de definición de alcance
(`docs/definiciones/`) y los tickets subsecuentes las vayan tomando._
