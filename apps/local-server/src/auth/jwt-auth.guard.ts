import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import {
  ALLOW_PENDING_PASSWORD_CHANGE_KEY,
  assertPasswordChangeNotPending,
} from './token-policy';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Acceso no autorizado: Token de sesión ausente o expirado');
    }

    // R0 / S7b: a pending mandatory password change blocks every route
    // except the ones explicitly marked with @AllowPendingPasswordChange().
    const targets = [context?.getHandler?.(), context?.getClass?.()].filter(Boolean) as any[];
    const allowsPending =
      targets.length > 0 &&
      this.reflector?.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE_KEY, targets) === true;
    assertPasswordChangeNotPending(user, allowsPending);

    return user;
  }
}
