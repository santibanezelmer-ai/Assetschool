import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SystemRole } from '@assetschool/shared-types';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (userRole?: SystemRole): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: userRole ? { role: userRole } : null,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const context = createMockContext(SystemRole.TEACHER);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SystemRole.TEACHER]);
    const context = createMockContext(SystemRole.TEACHER);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow superadmin regardless of required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SystemRole.INSTITUTION_ADMIN]);
    const context = createMockContext(SystemRole.SUPERADMIN);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject access if user lacks required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SystemRole.INSTITUTION_ADMIN]);
    const context = createMockContext(SystemRole.TEACHER);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject access if user is unauthenticated', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SystemRole.TEACHER]);
    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
