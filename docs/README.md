# mail-core-mc

Core de envío de correo electrónico propio (in-house), pensado para que otras
apps del ecosistema (empezando por `auth-core-mc`) dejen de depender de un
proveedor externo (SES, SendGrid, etc.) para enviar correo.

## Estado

Proyecto recién bootstrapeado. Aún en fase de definición de alcance —
ver `docs/definiciones/` cuando exista el documento de definición.

## Instalación / setup / run

_Pendiente — se completa cuando exista algo que correr (ver ticket 000 y
los tickets de la fase de definición)._

## Relación con otros servicios

- **auth-core-mc**: sigue siendo la fuente de verdad de identidad, permisos
  y autenticación. `mail-core-mc` es una app dependiente de `auth-core-mc`
  para autenticación/autorización de sus propios endpoints — no reimplementa
  login ni gestión de usuarios.
