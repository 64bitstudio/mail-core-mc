import { describe, it, expect, beforeAll } from 'vitest';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeAll(() => {
    // El constructor exige AUTH_CORE_MC_ISSUER_URI (falla explícito si
    // falta, ver el propio archivo) — en CI/dev normal ya viene del
    // .env real; en este test unitario solo se necesita algún valor
    // para poder instanciar y probar validate() (no hace una llamada
    // de red real al JWKS en este test).
    process.env.AUTH_CORE_MC_ISSUER_URI ??= 'http://localhost:8080';
    strategy = new JwtStrategy();
  });

  it('normaliza scope de string separado por espacios a array', () => {
    const result = strategy.validate({
      sub: 'mail-core-mc',
      scope: 'mail:send mail:admin' as unknown as string[],
      iss: 'http://localhost:8080',
      aud: 'mail-core-mc',
      exp: 9999999999,
    });

    expect(result.scope).toEqual(['mail:send', 'mail:admin']);
  });

  it('deja el scope tal cual si ya viene como array (formato real de auth-core-mc)', () => {
    const result = strategy.validate({
      sub: 'mail-core-mc',
      scope: ['mail:send'],
      iss: 'http://localhost:8080',
      aud: 'mail-core-mc',
      exp: 9999999999,
    });

    expect(result.scope).toEqual(['mail:send']);
  });
});
