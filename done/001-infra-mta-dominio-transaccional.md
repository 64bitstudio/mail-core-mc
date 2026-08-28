# 001 — Infraestructura de envío transaccional (dev: Postfix + DNS)

## Objetivo
Levantar la infraestructura de envío transaccional (Postfix + OpenDKIM +
DNS con SPF/DKIM/DMARC) para `mail.64bitstudio.com`, como base para el
resto de la Fase 1. Nace de HU-7 en
`docs/definiciones/mail-core-mc-v1.md`.

**Alcance ajustado durante la ejecución** (VoBo del Product Owner): en
vez de una VM dedicada nueva, esta primera vuelta corre en la máquina de
desarrollo — "de momento despliega todo en esta máquina, al finalizar la
movemos a un VM". La migración real a VM (con IP dedicada, PTR y
validación de entregabilidad real) queda como ticket propio: **009**.

## Alcance
**Incluye:**
- Postfix + OpenDKIM corriendo vía Docker
  (`infra/mta/docker-compose.yml`, imagen `docker-mailserver`) en la
  máquina de desarrollo.
- Cuenta SMTP de envío (`noreply@mail.64bitstudio.com`) con contraseña
  gestionada fuera del repo.
- Llave DKIM generada (RSA 2048, selector `mail`) y validada
  estructuralmente (`opendkim-testkey` confirma que la llave pública en
  DNS corresponde a la privada).
- Registros DNS reales en Cloudflare (zona `64bitstudio.com`, subdominio
  `mail.64bitstudio.com`, sin tocar los registros del dominio raíz que
  ya usa Cloudflare Email Routing):
  - SPF (`v=spf1 ip4:<IP de dev> ~all`)
  - DKIM (`mail._domainkey.mail.64bitstudio.com`)
  - DMARC (`_dmarc.mail.64bitstudio.com`, `p=none`)
- Validación de sintaxis/DNS de los 3 registros con las herramientas
  gratuitas de mail-tester.com (SPF & DKIM Checker, DMARC).
- Plan de calentamiento de IP documentado en `docs/ARQUITECTURA.md`
  (para ejecutarse en el ticket 009, no aquí).

**No incluye (movido a ticket 009):**
- VM dedicada con IP pública real.
- Registro PTR (no configurable desde una IP residencial).
- Validación de entregabilidad real / inbox placement (mail-tester.com
  con recepción real de un mensaje) — el ISP de esta red bloquea el
  puerto 25 saliente sobre IPv4, y el servidor de mail-tester no tiene
  IPv6, así que no hay forma de completar esta prueba desde aquí.
- Ejecución real del plan de calentamiento de IP.

## Criterios de aceptación (TDD)
- Dado el contenedor de Postfix/OpenDKIM corriendo localmente, cuando se
  envía un correo autenticado por el puerto 587, entonces el log
  confirma `DKIM-Signature field added` (firma aplicada correctamente).
- Dado `opendkim-testkey` contra la llave generada, entonces responde
  `key OK` (coincide con lo publicado en DNS).
- Dado los 3 registros DNS (SPF/DKIM/DMARC), cuando se consultan con las
  herramientas gratuitas de mail-tester.com, entonces cada uno se
  encuentra y su sintaxis es válida.
- Dado el dominio raíz `64bitstudio.com`, cuando se revisan sus
  registros DNS después de este ticket, entonces sus MX/SPF/DKIM de
  Cloudflare Email Routing (correo normal del negocio) siguen intactos,
  sin modificaciones.

## Hecho

- Postfix + OpenDKIM corriendo en Docker (`docker-mailserver`) en la
  máquina de desarrollo, con `network_mode: host` (necesario porque la
  red virtual de Docker/OrbStack bloqueaba el puerto 25 saliente aunque
  el host sí lo tenía abierto) — **VoBo explícito del Product Owner**
  para este tradeoff (expone el puerto 587 autenticado a la red local en
  vez de solo `localhost`; aceptable en dev, se revierte en la VM del
  ticket 009, donde el contenedor tendrá su propia IP pública real sin
  necesitar este bypass).
- Cuenta `noreply@mail.64bitstudio.com` creada; contraseña gestionada
  fuera del repo (`.env` local, gitignored).
- Llave DKIM RSA 2048 (selector `mail`) generada y validada con
  `opendkim-testkey` (`key OK`).
- Registros SPF, DKIM y DMARC creados en Cloudflare vía API (token con
  scope limitado a `Zone.DNS` de `64bitstudio.com`) y confirmados
  resueltos en DNS público. Los registros existentes del dominio raíz
  (Cloudflare Email Routing) no se tocaron.
- Validación de sintaxis SPF/DKIM confirmada con la herramienta gratuita
  de mail-tester.com (sin necesitar envío real): registro encontrado,
  llave de 2048 bits reconocida correctamente.
- **Hallazgo real encontrado en el camino:** un primer intento de envío
  de prueba no quedó firmado por DKIM (`no signing table match`) — causa
  raíz: la llave DKIM se generó *después* de que el contenedor ya había
  copiado su configuración a `/etc/opendkim/` en el primer arranque, y
  un `docker compose restart` no vuelve a sincronizar esa copia; hizo
  falta un `docker compose down && up` completo. Documentado aquí para
  que el ticket 009 (o cualquier reconfiguración de DKIM futura) no
  repita el mismo tropiezo.
- **Hallazgo de seguridad, corregido en el momento:** una prueba con
  `swaks` sin `--auth-hide-password` expuso la contraseña de la cuenta
  SMTP (codificada en base64, reversible) en la salida de la sesión. Se
  rotó la contraseña inmediatamente después de detectarlo.
- **Validación real de entregabilidad NO completada** — ver "No incluye"
  arriba y ticket 009 para el resto.
