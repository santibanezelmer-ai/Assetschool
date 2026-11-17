import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SystemRole } from '@assetschool/shared-types';
import { MissingSecretError, requireEnv, requireJwtSecret } from '../config/required-env';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';
import { DevicesController } from '../devices/devices.controller';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE } from './token-policy';

/**
 * R0 — S7 (no hardcoded secrets) and S7b (token type + mandatory password change).
 */
describe('R0 · S7/S7b — Secrets and token policy', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe('S7 · mandatory secrets', () => {
    it('throws MissingSecretError when JWT_SECRET is not defined (no fallback)', () => {
      delete process.env.JWT_SECRET;
      expect(() => requireJwtSecret()).toThrow(MissingSecretError);
      expect(() => new JwtStrategy()).toThrow(MissingSecretError);
    });

    it('rejects a JWT_SECRET shorter than 32 characters', () => {
      process.env.JWT_SECRET = 'short-secret';
      expect(() => requireJwtSecret()).toThrow(/al menos 32/);
    });

    it('rejects empty values', () => {
      process.env.SOME_SECRET = '   ';
      expect(() => requireEnv('SOME_SECRET')).toThrow(MissingSecretError);
    });

    it('DatabaseService refuses to connect without DATABASE_PASSWORD (no default password)', async () => {
      delete process.env.DATABASE_PASSWORD;
      delete process.env.DATABASE_MODE;
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_HOST = '127.0.0.1';
      process.env.DATABASE_PORT = '1'; // never reached: must bail out before connecting

      const db = new DatabaseService();
      const errorSpy = jest.spyOn((db as any).logger, 'error').mockImplementation(() => undefined);
      await db.onModuleInit();

      expect(db.isDatabaseReady).toBe(false);
      expect((db as any).pool).toBeNull();
      expect(errorSpy.mock.calls[0][0]).toMatch(/DATABASE_PASSWORD/);
      await expect(db.query('SELECT 1')).rejects.toThrow(/no disponible/);
    });
  });

  describe('S7b · token type', () => {
    const accessPayload = {
      sub: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      type: ACCESS_TOKEN_TYPE,
      email: 'profesor@assetschool.lan',
      role: SystemRole.TEACHER,
      institutionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      firstName: 'P',
      lastName: 'D',
    };

    it('accepts access tokens', async () => {
      const strategy = new JwtStrategy();
      const user = await strategy.validate(accessPayload as any);
      expect(user.userId).toBe(accessPayload.sub);
      expect(user.mustChangePassword).toBe(false);
    });

    it('reads the pending-password state from the database, not from the stale claim', async () => {
      process.env.DATABASE_MODE = 'memory_test_only';
      const db = new DatabaseService();
      await db.onModuleInit();
      const strategy = new JwtStrategy(db);

      await db.query(`UPDATE users SET must_change_password = false WHERE id = $1`, [accessPayload.sub]);
      const afterChange = await strategy.validate({ ...accessPayload, mustChangePassword: true } as any);
      expect(afterChange.mustChangePassword).toBe(false);

      await db.query(`UPDATE users SET must_change_password = true WHERE id = $1`, [accessPayload.sub]);
      const pending = await strategy.validate({ ...accessPayload, mustChangePassword: false } as any);
      expect(pending.mustChangePassword).toBe(true);

      await db.query(`UPDATE users SET is_active = false WHERE id = $1`, [accessPayload.sub]);
      await expect(strategy.validate(accessPayload as any)).rejects.toThrow(UnauthorizedException);
      await db.onModuleDestroy();
    });

    it('rejects refresh tokens used as access tokens', async () => {
      const strategy = new JwtStrategy();
      await expect(
        strategy.validate({ sub: accessPayload.sub, type: REFRESH_TOKEN_TYPE } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects legacy tokens without a type', async () => {
      const strategy = new JwtStrategy();
      const { type, ...legacy } = accessPayload;
      await expect(strategy.validate(legacy as any)).rejects.toThrow(UnauthorizedException);
    });

    it('AuthService.login issues an access token with type=access and a refresh token with type=refresh', async () => {
      process.env.DATABASE_MODE = 'memory_test_only';
      const db = new DatabaseService();
      await db.onModuleInit();
      const jwt = new JwtService({ secret: requireJwtSecret() });
      const auth = new AuthService(db, jwt);

      // Seed users have unknown demo passwords in this context: set a known one.
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash('R0-Test-Password!1', 4);
      await db.query("UPDATE users SET password_hash = $1 WHERE email = 'profesor@assetschool.lan'", [hash]);

      const result = await auth.login({ email: 'profesor@assetschool.lan', password: 'R0-Test-Password!1' });
      expect(jwt.verify(result.accessToken).type).toBe(ACCESS_TOKEN_TYPE);
      expect(jwt.verify(result.refreshToken).type).toBe(REFRESH_TOKEN_TYPE);

      // The real refresh token must be rejected by the access strategy.
      await expect(new JwtStrategy().validate(jwt.verify(result.refreshToken))).rejects.toThrow(
        UnauthorizedException,
      );
      await db.onModuleDestroy();
    });
  });

  describe('S7b · mandatory password change', () => {
    const contextFor = (handler: Function, cls: Function) =>
      ({ getHandler: () => handler, getClass: () => cls } as unknown as ExecutionContext);
    const pendingUser = { userId: 'u1', role: SystemRole.TEACHER, mustChangePassword: true };
    const guard = new JwtAuthGuard(new Reflector());

    it('blocks ordinary routes while the password change is pending', () => {
      expect(() =>
        guard.handleRequest(null, pendingUser, null, contextFor(DevicesController.prototype.getDevices, DevicesController)),
      ).toThrow(ForbiddenException);
    });

    it('allows change-password and me while the password change is pending', () => {
      expect(
        guard.handleRequest(null, pendingUser, null, contextFor(AuthController.prototype.changePassword, AuthController)),
      ).toBe(pendingUser);
      expect(
        guard.handleRequest(null, pendingUser, null, contextFor(AuthController.prototype.getProfile, AuthController)),
      ).toBe(pendingUser);
    });

    it('lets users without a pending change through', () => {
      const user = { ...pendingUser, mustChangePassword: false };
      expect(
        guard.handleRequest(null, user, null, contextFor(DevicesController.prototype.getDevices, DevicesController)),
      ).toBe(user);
    });
  });
});
