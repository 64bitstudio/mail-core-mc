# 009 — Migración de la infraestructura de correo a la VM dedicada

## Objetivo
Mover Postfix/OpenDKIM (hoy corriendo en la máquina de desarrollo, ticket
001) a una VM dedicada con IP pública real, y completar ahí lo que la
fase de desarrollo no pudo validar: registro PTR, calentamiento de IP
real, y entregabilidad real a bandeja de entrada. Nace de HU-7 en
`docs/definiciones/mail-core-mc-v1.md` y del ajuste de alcance hecho en
el ticket 001 (ver su sección "Hecho").

## Contexto — por qué es un ticket aparte de 001
El ticket 001 se ejecutó en fase de desarrollo, en la máquina local, por
decisión explícita del Product Owner ("de momento despliega todo en esta
máquina, al finalizar la movemos a un VM"). Ahí se validó todo lo que
depende solo de configuración (DKIM firma correctamente, SPF/DKIM/DMARC
con sintaxis y DNS correctos), pero **no se pudo validar entregabilidad
real**: el ISP de esta red bloquea el puerto 25 saliente sobre IPv4 (sí
funciona sobre IPv6, pero el servidor de prueba de mail-tester.com no
tiene IPv6), y una IP residencial no admite configurar un registro PTR.
Este ticket cubre exactamente esa parte pendiente.

## Alcance
**Incluye:**
- Provisionar la VM dedicada (proveedor a definir — pendiente, ver
  Riesgos del documento de definición) con IP pública propia.
- Mover `infra/mta/docker-compose.yml` tal cual (sin cambios de fondo) a
  la VM; quitar el workaround `network_mode: host` usado en dev (en la
  VM el contenedor puede tener su propia IP real sin necesitar ese
  bypass).
- Configurar el registro PTR (reverse DNS) de la IP de la VM apuntando a
  `mail.64bitstudio.com`.
- Actualizar el registro SPF en Cloudflare con la IP real de la VM
  (único valor de DNS que cambia respecto a dev).
- Ejecutar el plan de calentamiento de IP documentado en
  `docs/ARQUITECTURA.md`.
- Repetir la prueba con mail-tester.com (esta vez de punta a punta, con
  recepción real) y confirmar un score alto antes de considerar la
  infraestructura lista para producción.
- Confirmar con el proveedor de la VM si soporta una segunda IP de
  salida (prerequisito de la Fase 3 — solo confirmar aquí, no
  aprovisionarla todavía).

**No incluye:**
- Cambios de código de `mail-core-mc` (tickets 002-007, ya deben estar
  terminados y probados contra la instancia de dev antes de este
  ticket).
- La instancia de Postfix de marketing (`news.64bitstudio.com`) — Fase 3.

## Criterios de aceptación (TDD)
- Dado un correo de prueba enviado desde la VM a una dirección de
  mail-tester.com, cuando se revisa el score, entonces SPF, DKIM y DMARC
  pasan y el score general es alto (referencia: ≥8/10).
- Dado la IP pública de la VM, cuando se hace un lookup PTR, entonces
  resuelve a `mail.64bitstudio.com`.
- Dado el registro SPF actualizado, cuando se consulta en DNS público,
  entonces refleja la IP de la VM (no la IP de dev usada en el ticket
  001).
- Dado el plan de calentamiento de IP, cuando arranca el envío real,
  entonces el volumen diario sigue la rampa documentada.

## Hecho
