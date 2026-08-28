import { describe, it, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  it('devuelve el usuario si la validación fue exitosa', () => {
    const guard = new JwtAuthGuard();
    const user = { sub: 'mail-core-mc', scope: ['mail:send'] };

    expect(guard.handleRequest(null, user, null)).toBe(user);
  });

  it('lanza 401 si passport-jwt no encontró un usuario (token expirado/inválido, AC3)', () => {
    const guard = new JwtAuthGuard();

    expect(() => guard.handleRequest(null, null, new Error('jwt expired'))).toThrow(UnauthorizedException);
  });

  it('propaga el error original si passport-jwt ya lanzó uno explícito', () => {
    const guard = new JwtAuthGuard();
    const originalError = new UnauthorizedException('token malformado');

    expect(() => guard.handleRequest(originalError, null, null)).toThrow(originalError);
  });
});
