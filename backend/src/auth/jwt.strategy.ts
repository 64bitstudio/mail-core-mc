import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

export interface AuthCoreMcJwtPayload {
  sub: string; // client_id de auth-core-mc (ej. "mail-core-mc" para el propio servicio, u otra app llamante)
  scope: string[];
  iss: string;
  aud: string | string[];
  exp: number;
}

// Resource server: valida JWTs emitidos por auth-core-mc contra su JWK
// Set — sin base de credenciales propia (HU-6). jwks-rsa cachea las
// llaves y respeta la rotación (auth-core-mc regenera su llave RSA en
// cada arranque, ver su docs/API.md — un token emitido antes de un
// reinicio de auth-core-mc deja de verificar después de uno; eso es
// esperado, no un bug de este lado).
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor() {
    const issuer = process.env.AUTH_CORE_MC_ISSUER_URI;
    if (!issuer) {
      throw new Error('AUTH_CORE_MC_ISSUER_URI no está configurado — no se puede validar JWTs sin saber de dónde vienen');
    }

    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // No se fuerza audience aquí a nivel de librería — se valida
      // explícitamente en validate() para poder loguear/distinguir el
      // motivo exacto de un rechazo (401 vs 403 los diferencia el guard
      // de scopes, no esta capa).
      issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${issuer}/oauth2/jwks`,
      }),
    };
    super(options);
  }

  validate(payload: AuthCoreMcJwtPayload): AuthCoreMcJwtPayload {
    // passport-jwt ya validó firma/expiración/issuer antes de llegar
    // aquí — esto solo normaliza scope a array (auth-core-mc lo emite
    // como array, pero algunos IdPs lo mandan como string separado por
    // espacios) para que el guard de scopes no tenga que saberlo.
    const scope = Array.isArray(payload.scope) ? payload.scope : String(payload.scope ?? '').split(' ');
    this.logger.debug(`Token válido de client_id=${payload.sub}, scopes=${scope.join(',')}`);
    return { ...payload, scope };
  }
}
