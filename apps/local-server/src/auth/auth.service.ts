import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { LoginRequest, ChangePasswordRequest } from '@assetschool/validators';
import { SystemRole } from '@assetschool/shared-types';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const res = await this.databaseService.query(
      `SELECT u.id, u.institution_id, u.email, u.password_hash, u.first_name, u.last_name, 
              u.is_active, u.must_change_password, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE LOWER(u.email) = LOWER($1) AND u.is_active = true`,
      [email],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const user = res.rows[0];
    const isMatch = await bcrypt.compare(pass, user.password_hash);
    if (!isMatch) {
      return null;
    }

    // Update last login timestamp without logging sensitive info
    await this.databaseService.query(
      'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
      [user.id],
    );

    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  async login(loginDto: LoginRequest) {
    if (!loginDto.email || !loginDto.password) {
      throw new BadRequestException('Email y contraseña requeridos');
    }

    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role_name as SystemRole,
      institutionId: user.institution_id,
      firstName: user.first_name,
      lastName: user.last_name,
      mustChangePassword: user.must_change_password,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: '7d' },
    );

    // Store hashed refresh token in database
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.databaseService.query(
      'UPDATE users SET refresh_token_hash = $1 WHERE id = $2',
      [refreshTokenHash, user.id],
    );

    // Audit login event
    await this.databaseService.query(
      `INSERT INTO audit_logs (id, institution_id, actor_user_id, actor_role, action, entity_type, entity_id, details_json, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        randomUUID(),
        user.institution_id,
        user.id,
        user.role_name,
        'USER_LOGIN',
        'AUTH',
        user.id,
        JSON.stringify({ email: user.email }),
      ],
    );

    this.logger.log(`Usuario autenticado exitosamente: ${user.email} (${user.role_name})`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role_name,
        institutionId: user.institution_id,
        mustChangePassword: Boolean(user.must_change_password),
      },
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    };
  }

  async changePassword(userId: string, dto: ChangePasswordRequest) {
    const res = await this.databaseService.query(
      'SELECT id, email, password_hash, institution_id, role_id FROM users WHERE id = $1',
      [userId],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const user = res.rows[0];
    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.password_hash);
    if (!isCurrentValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    const isSameAsOld = await bcrypt.compare(dto.newPassword, user.password_hash);
    if (isSameAsOld) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la anterior');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.databaseService.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [newHash, userId],
    );

    // Audit password change
    await this.databaseService.query(
      `INSERT INTO audit_logs (id, institution_id, actor_user_id, action, entity_type, entity_id, details_json, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        randomUUID(),
        user.institution_id,
        userId,
        'PASSWORD_CHANGED',
        'USER',
        userId,
        JSON.stringify({ mandatoryUpdate: true }),
      ],
    );

    this.logger.log(`Contraseña actualizada con éxito para el usuario ID: ${userId}`);

    return {
      success: true,
      message: 'Contraseña actualizada exitosamente. Por favor vuelva a iniciar sesión.',
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded: any = this.jwtService.verify(refreshToken);
      if (!decoded || decoded.type !== 'refresh') {
        throw new UnauthorizedException('Token de refresco inválido');
      }

      const res = await this.databaseService.query(
        `SELECT u.id, u.institution_id, u.email, u.first_name, u.last_name, u.is_active, 
                u.must_change_password, u.refresh_token_hash, r.name as role_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1 AND u.is_active = true`,
        [decoded.sub],
      );

      if (res.rows.length === 0) {
        throw new UnauthorizedException('Usuario no encontrado o inactivo');
      }

      const user = res.rows[0];
      if (!user.refresh_token_hash) {
        throw new UnauthorizedException('Sesión revocada');
      }

      const isMatch = await bcrypt.compare(refreshToken, user.refresh_token_hash);
      if (!isMatch) {
        throw new UnauthorizedException('Token de refresco no coincide o revocado');
      }

      const newAccessToken = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        role: user.role_name as SystemRole,
        institutionId: user.institution_id,
        firstName: user.first_name,
        lastName: user.last_name,
        mustChangePassword: user.must_change_password,
      });

      return {
        accessToken: newAccessToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      };
    } catch (err: any) {
      throw new UnauthorizedException('Token de refresco expirado o no autorizado');
    }
  }

  async getCurrentUser(userId: string) {
    const res = await this.databaseService.query(
      `SELECT u.id, u.institution_id, u.email, u.first_name, u.last_name, 
              u.must_change_password, u.last_login_at, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return res.rows[0];
  }
}
