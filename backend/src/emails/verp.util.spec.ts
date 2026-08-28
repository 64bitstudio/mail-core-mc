import { describe, it, expect } from 'vitest';
import { buildVerpAddress, parseVerpAddress } from './verp.util.js';

describe('VERP', () => {
  it('construye la dirección con el message_id como extensión +', () => {
    expect(buildVerpAddress('abc-123', 'mail.64bitstudio.com')).toBe(
      'bounces+abc-123@mail.64bitstudio.com',
    );
  });

  it('extrae el message_id de una dirección VERP real', () => {
    expect(parseVerpAddress('bounces+abc-123@mail.64bitstudio.com')).toBe('abc-123');
  });

  it('devuelve null si la dirección no es VERP', () => {
    expect(parseVerpAddress('noreply@mail.64bitstudio.com')).toBeNull();
    expect(parseVerpAddress('otrobuzon+abc@mail.64bitstudio.com')).toBeNull();
  });
});
