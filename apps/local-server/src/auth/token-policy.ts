import { ForbiddenException, SetMetadata, UnauthorizedException } from '@nestjs/common';

/**
 * R0 / S7b: token type and pending-password-change policy shared by the
 * REST guard and the WebSocket gateway.
 */
export const ACCESS_TOKEN_TYPE = 'access';
export const REFRESH_TOKEN_TYPE = 'refresh';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

/** Marks a route as usable while the user still has to change the password. */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);

export interface DecodedAccessToken {
  sub: string;
  type?: string;
  email?: string;
  role?: string;
  institutionId?: string;
  firstName?: string;
  lastName?: string;
  mustChangePassword?: boolean;
}

/** Throws unless the decoded token is an access token with a subject. */
export function assertAccessToken(decoded: DecodedAccessToken | null | undefined): asserts decoded is DecodedAccessToken {
  if (!decoded || !decoded.sub) {
    throw new UnauthorizedException('Token inválido');
  }
  if (decoded.type !== ACCESS_TOKEN_TYPE) {
    throw new UnauthorizedException('Tipo de token no válido para acceso');
  }
}

/** Throws when the user must change the password and the route does not allow it. */
export function assertPasswordChangeNotPending(
  user: { mustChangePassword?: boolean } | null | undefined,
  routeAllowsPending: boolean,
): void {
  if (user?.mustChangePassword && !routeAllowsPending) {
    throw new ForbiddenException(
      'Debe cambiar su contraseña antes de continuar (PASSWORD_CHANGE_REQUIRED)',
    );
  }
}
