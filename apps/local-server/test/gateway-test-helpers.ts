import { JwtService } from '@nestjs/jwt';
import { SystemRole } from '@assetschool/shared-types';
import { ACCESS_TOKEN_TYPE } from '../src/auth/token-policy';

/** Real JwtService with the ephemeral per-run test secret (see jest.setup-env.ts). */
export function createTestJwtService(): JwtService {
  return new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } });
}

export const INSTITUTION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const TEACHER_A_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
export const CLASSROOM_A1 = 'd1111111-1111-1111-1111-111111111111';

/** Signs a real access token (type=access) for a teacher. */
export function signTeacherToken(
  jwt: JwtService,
  overrides: Partial<{
    sub: string;
    email: string;
    role: SystemRole | string;
    institutionId: string;
    mustChangePassword: boolean;
    type: string;
  }> = {},
): string {
  return jwt.sign({
    sub: TEACHER_A_ID,
    type: ACCESS_TOKEN_TYPE,
    email: 'profesor@assetschool.lan',
    role: SystemRole.TEACHER,
    institutionId: INSTITUTION_A,
    firstName: 'Mariana',
    lastName: 'Fuentes',
    mustChangePassword: false,
    ...overrides,
  });
}
