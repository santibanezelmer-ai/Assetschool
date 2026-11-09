import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SystemRole } from '@assetschool/shared-types';

describe('AuthService Integration & Security Tests', () => {
  let authService: AuthService;
  let dbService: DatabaseService;

  beforeEach(async () => {
    process.env.DATABASE_MODE = 'memory_test_only';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        DatabaseService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn((payload) => `signed_jwt_${payload.sub || 'token'}`),
            verify: jest.fn((token) => {
              if (token.includes('valid_refresh')) {
                return { sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', type: 'refresh' };
              }
              throw new Error('Invalid token');
            }),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    dbService = module.get<DatabaseService>(DatabaseService);
    await dbService.onModuleInit();
  });

  afterEach(async () => {
    await dbService.onModuleDestroy();
  });

  it('should authenticate user with valid credentials and flag mustChangePassword on initial login', async () => {
    const result = await authService.login({
      email: 'admin@assetschool.lan',
      password: 'Admin123!*',
    });

    expect(result).toBeDefined();
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.role).toBe(SystemRole.INSTITUTION_ADMIN);
    expect(result.user.mustChangePassword).toBe(true);
  });

  it('should reject invalid credentials without leaking password details', async () => {
    await expect(
      authService.login({
        email: 'admin@assetschool.lan',
        password: 'IncorrectPassword2026!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should enforce mandatory password change and prevent reusing the same password', async () => {
    const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    // Same password rejection
    await expect(
      authService.changePassword(userId, {
        currentPassword: 'Admin123!*',
        newPassword: 'Admin123!*',
      }),
    ).rejects.toThrow(BadRequestException);

    // Wrong current password rejection
    await expect(
      authService.changePassword(userId, {
        currentPassword: 'WrongPassword!',
        newPassword: 'BrandNewSecurePass2026!*',
      }),
    ).rejects.toThrow(BadRequestException);

    // Valid change
    const updateResult = await authService.changePassword(userId, {
      currentPassword: 'Admin123!*',
      newPassword: 'BrandNewSecurePass2026!*',
    });

    expect(updateResult.success).toBe(true);

    // Verify user in database now has must_change_password = false
    const user = await authService.getCurrentUser(userId);
    expect(user.must_change_password).toBe(false);
  });
});
