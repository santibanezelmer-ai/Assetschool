import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  LoginRequestSchema,
  LoginRequest,
  ChangePasswordSchema,
  ChangePasswordRequest,
  RefreshTokenSchema,
  RefreshTokenRequest,
} from '@assetschool/validators';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginRequest) {
    const validated = LoginRequestSchema.parse(body);
    return this.authService.login(validated);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req: any,
    @Body() body: ChangePasswordRequest,
  ) {
    const validated = ChangePasswordSchema.parse(body);
    return this.authService.changePassword(req.user.userId, validated);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() body: RefreshTokenRequest) {
    const validated = RefreshTokenSchema.parse(body);
    return this.authService.refreshToken(validated.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: any) {
    return this.authService.getCurrentUser(req.user.userId);
  }
}
