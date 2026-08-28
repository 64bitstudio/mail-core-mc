import { describe, it, expect } from 'vitest';
import { isTransientSmtpError } from './smtp-error.util.js';

describe('isTransientSmtpError', () => {
  it('trata un 4xx como transitorio', () => {
    expect(isTransientSmtpError({ responseCode: 450 })).toBe(true);
  });

  it('trata un 5xx como permanente', () => {
    expect(isTransientSmtpError({ responseCode: 550 })).toBe(false);
  });

  it('trata un error sin responseCode (ej. de red) como transitorio', () => {
    expect(isTransientSmtpError(new Error('ECONNREFUSED'))).toBe(true);
  });
});
