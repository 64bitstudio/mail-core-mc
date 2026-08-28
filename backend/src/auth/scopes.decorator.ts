import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'scopes';

// Uso: @RequireScopes('mail:send') sobre un handler, después de
// @UseGuards(JwtAuthGuard, ScopesGuard) — JwtAuthGuard corre primero
// (401 si el token no es válido) y solo entonces ScopesGuard revisa el
// scope (403 si el token es válido pero no autoriza esta acción).
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
