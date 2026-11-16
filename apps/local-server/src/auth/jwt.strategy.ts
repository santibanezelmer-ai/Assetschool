import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SystemRole } from '@assetschool/shared-types';
import { requireJwtSecret } from '../config/required-env';
import { assertAccessToken } from './token-policy';

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
  constructor() {
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
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      institutionId: payload.institutionId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      mustChangePassword: Boolean(payload.mustChangePassword),
    };
  }
}
