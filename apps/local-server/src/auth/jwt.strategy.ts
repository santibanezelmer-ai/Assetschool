import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SystemRole } from '@assetschool/shared-types';

export interface JwtPayload {
  sub: string;
  email: string;
  role: SystemRole;
  institutionId: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'assetschool_jwt_super_secret_local_lan_token_phase1_2026',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Token inválido');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      institutionId: payload.institutionId,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };
  }
}
