import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { requireJwtSecret } from '../config/required-env';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // R0 / S7: the secret is resolved at bootstrap and is mandatory.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: requireJwtSecret(),
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard],
  exports: [AuthService, JwtModule, RolesGuard],
})
export class AuthModule {}
