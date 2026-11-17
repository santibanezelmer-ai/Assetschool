import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SystemRole } from '@assetschool/shared-types';
import { requireJwtSecret } from '../config/required-env';
import { DatabaseService } from '../database/database.service';
import { assertAccessToken, resolveUserAccountState } from './token-policy';

export interface JwtPayload {
  sub: string;
  type?: string;
  email: string;
  role: SystemRole;
  institutionId: string;
  firstName: string;
  lastName: string;
  mustChangePassword?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Optional() private readonly databaseService?: DatabaseService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // R0 / S7: no hardcoded fallback secret.
      secretOrKey: requireJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    // R0 / S7b: refresh tokens (or any non-access token) are rejected here.
    assertAccessToken(payload);

    // R0 / S7b: the pending-password-change state is read from the database,
    // not from the (possibly stale) token claim, so that a user who just
    // changed the password is not locked out until the next login.
    const state = await resolveUserAccountState(this.databaseService, payload.sub, payload.mustChangePassword);
    if (!state.active) {
      throw new UnauthorizedException('Usuario inexistente o desactivado');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      institutionId: payload.institutionId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      mustChangePassword: state.mustChangePassword,
    };
  }
}
