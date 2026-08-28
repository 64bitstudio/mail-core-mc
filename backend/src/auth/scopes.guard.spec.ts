import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopesGuard } from './scopes.guard.js';

function mockContext(user: { scope: string[] } | undefined) {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('ScopesGuard', () => {
  it('permite el acceso si no hay @RequireScopes en el handler', () => {
    const reflector = { get: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new ScopesGuard(reflector);

    expect(guard.canActivate(mockContext({ scope: [] }))).toBe(true);
  });

  it('permite el acceso si el token trae el scope requerido (AC1)', () => {
    const reflector = { get: vi.fn().mockReturnValue(['mail:send']) } as unknown as Reflector;
    const guard = new ScopesGuard(reflector);

    expect(guard.canActivate(mockContext({ scope: ['mail:send', 'otro'] }))).toBe(true);
  });

  it('rechaza con 403 si el token no trae el scope requerido (AC2)', () => {
    const reflector = { get: vi.fn().mockReturnValue(['mail:send']) } as unknown as Reflector;
    const guard = new ScopesGuard(reflector);

    expect(() => guard.canActivate(mockContext({ scope: ['otro-scope'] }))).toThrow(ForbiddenException);
  });

  it('rechaza si no hay usuario en el request', () => {
    const reflector = { get: vi.fn().mockReturnValue(['mail:send']) } as unknown as Reflector;
    const guard = new ScopesGuard(reflector);

    expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
  });
});
