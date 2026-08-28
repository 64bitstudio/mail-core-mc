import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// 401 explícito para JWT expirado/inválido/de un client_id no
// reconocido por el JWK Set — el comportamiento default de passport-jwt
// (401 "Unauthorized" genérico) ya cumple esto, pero se loguea el
// motivo real (nunca visible al llamante, solo para debug operativo).
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest<TUser = unknown>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      this.logger.warn(`Rechazo de autenticación: ${(info as Error)?.message ?? err ?? 'sin token'}`);
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    return user;
  }
}
