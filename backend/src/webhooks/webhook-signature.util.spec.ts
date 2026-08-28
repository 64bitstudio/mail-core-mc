import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { generateWebhookSecret, signWebhookPayload } from './webhook-signature.util.js';

describe('webhook signature', () => {
  it('firma un payload de forma determinística para el mismo secret (AC3)', () => {
    const payload = JSON.stringify({ hola: 'mundo' });
    const secret = 'mi-secret';

    const signature = signWebhookPayload(payload, secret);
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    expect(signature).toBe(expected);
  });

  it('el receptor puede validar la firma recalculándola con el mismo secret (AC3)', () => {
    const payload = JSON.stringify({ messageId: 'msg-1', event: 'sent' });
    const secret = 'shared-secret';

    const signature = signWebhookPayload(payload, secret);
    const recomputed = signWebhookPayload(payload, secret);

    expect(recomputed).toBe(signature);
  });

  it('un secret distinto produce una firma distinta', () => {
    const payload = JSON.stringify({ a: 1 });
    expect(signWebhookPayload(payload, 'secret-a')).not.toBe(signWebhookPayload(payload, 'secret-b'));
  });

  it('genera secrets aleatorios de longitud consistente', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64); // 32 bytes en hex
  });
});
