import { describe, it, expect } from 'vitest';
import { isTransientWebhookError } from './webhook-error.util.js';

describe('isTransientWebhookError', () => {
  it('trata un 5xx como transitorio (AC2)', () => {
    expect(isTransientWebhookError(500)).toBe(true);
    expect(isTransientWebhookError(503)).toBe(true);
  });

  it('trata un 4xx como permanente (AC2)', () => {
    expect(isTransientWebhookError(400)).toBe(false);
    expect(isTransientWebhookError(404)).toBe(false);
  });

  it('trata la ausencia de status (timeout/error de red) como transitorio (AC2)', () => {
    expect(isTransientWebhookError(undefined)).toBe(true);
  });
});
