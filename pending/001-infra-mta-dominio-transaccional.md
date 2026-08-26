# 001 — Infraestructura de envío transaccional (VM, Postfix, DNS)

## Objetivo
Provisionar la infraestructura de envío que el resto de la Fase 1 necesita
para poder entregar correo real: una VM dedicada con Postfix configurado
como MTA transaccional, DNS (SPF/DKIM/DMARC) en `mail.64bitstudio.com`, y
un plan de calentamiento de IP. Sin esto, ningún otro ticket de la Fase 1
puede probarse contra entrega real. Nace de HU-7 en
`docs/definiciones/mail-core-mc-v1.md`.

## Alcance
**Incluye:**
- VM dedicada (nueva, no el runner de CI existente) con Postfix instalado
  y configurado en modo `postmulti` (se deja lista la instancia
  transaccional; la instancia de marketing se activa en la Fase 3, ticket
  aparte).
- Subdominio `mail.64bitstudio.com` con registros SPF, DKIM (llave
  generada y almacenada de forma segura — nunca en el repo/logs) y DMARC
  (arrancar en `p=none` para monitoreo antes de endurecer).
- Documentar el plan de calentamiento de IP (rampa de volumen diaria) en
  `docs/ARQUITECTURA.md`.
- Confirmar con el proveedor de la VM si soporta una segunda IP de salida
  (prerequisito para la Fase 3 — solo confirmar aquí, no aprovisionarla).

**No incluye:**
- La instancia de Postfix de marketing (`news.64bitstudio.com`) — Fase 3.
- Cualquier código de la app `mail-core-mc` — este ticket es puramente
  infraestructura.

## Criterios de aceptación (TDD)
- Dado un correo de prueba enviado vía la instancia transaccional de
  Postfix, cuando se valida en el destino, entonces pasa SPF, DKIM y
  DMARC (verificable con una herramienta tipo mail-tester.com).
- Dado el plan de calentamiento documentado, cuando se revisa
  `docs/ARQUITECTURA.md`, entonces incluye la rampa de volumen diaria
  propuesta para las primeras semanas.
- Dado el proveedor de la VM, cuando se consulta su soporte de IPs
  adicionales, entonces queda documentada la respuesta (sí/no y cómo) en
  este ticket antes de cerrarlo.

## Hecho
