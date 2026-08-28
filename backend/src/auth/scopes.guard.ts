import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator.js';
import type { AuthCoreMcJwtPayload } from './jwt.strategy.js';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<string[]>(SCOPES_KEY, context.getHandler());
    if (!required || required.length === 0) {
      return true; // sin @RequireScopes, cualquier token válido pasa
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthCoreMcJwtPayload }>();
    const userScopes = request.user?.scope ?? [];
    const hasAll = required.every((scope) => userScopes.includes(scope));
    if (!hasAll) {
      throw new ForbiddenException(`Falta el scope requerido: ${required.join(', ')}`);
    }
    return true;
  }
}
