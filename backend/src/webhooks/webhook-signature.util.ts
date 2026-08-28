import { createHmac, randomBytes } from 'node:crypto';

/** Firma un payload (JSON ya serializado) con HMAC-SHA256 — el receptor
 * recalcula la misma firma con su copia del secret para validar que el
 * webhook realmente vino de mail-core-mc. */
export function signWebhookPayload(payloadJson: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadJson).digest('hex');
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}
