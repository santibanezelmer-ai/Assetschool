import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { SystemRole } from '@assetschool/shared-types';

describe('AuthService', () => {
  let authService: AuthService;
  let dbService: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        DatabaseService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(() => 'mock_jwt_token_phase1'),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    dbService = module.get<DatabaseService>(DatabaseService);
    await dbService.onModuleInit();
  });

  it('should authenticate admin user with valid credentials', async () => {
    const result = await authService.login({
      email: 'admin@assetschool.lan',
      password: 'Admin123!*',
    });

    expect(result).toBeDefined();
    expect(result.accessToken).toBe('mock_jwt_token_phase1');
    expect(result.user.role).toBe(SystemRole.INSTITUTION_ADMIN);
    expect(result.user.email).toBe('admin@assetschool.lan');
  });

  it('should authenticate teacher user with valid credentials', async () => {
    const result = await authService.login({
      email: 'profesor@assetschool.lan',
      password: 'Docente123!*',
    });

    expect(result).toBeDefined();
    expect(result.user.role).toBe(SystemRole.TEACHER);
  });

  it('should throw UnauthorizedException on wrong password', async () => {
    await expect(
      authService.login({
        email: 'admin@assetschool.lan',
        password: 'WrongPassword!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
