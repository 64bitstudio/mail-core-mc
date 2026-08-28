// VERP (Variable Envelope Return Path): el message_id va codificado en
// el sobre de retorno (MAIL FROM / Return-Path) de cada envío, nunca en
// el header "From" visible — así un bounce que regrese se puede
// emparejar programáticamente con el mensaje exacto que lo originó, sin
// depender de parsear heurísticamente el cuerpo del bounce (ticket 006).
//
// "+" como separador porque `recipient_delimiter = +` ya está
// configurado en Postfix (ticket 001/006) — cualquier correo a
// bounces+ALGO@dominio cae en el mismo buzón `bounces`, con el "ALGO"
// preservado en el header Delivered-To para poder extraerlo de vuelta.
const VERP_LOCAL_PART = 'bounces';

export function buildVerpAddress(messageId: string, domain: string): string {
  return `${VERP_LOCAL_PART}+${messageId}@${domain}`;
}

/** Extrae el message_id de una dirección VERP, o null si no matchea el patrón. */
export function parseVerpAddress(address: string): string | null {
  const match = address.match(new RegExp(`^${VERP_LOCAL_PART}\\+([^@]+)@`));
  return match ? match[1] : null;
}
