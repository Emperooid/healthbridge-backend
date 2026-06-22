import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { setAuthCookies, clearAuthCookies } from '../../common/utils/set-auth-cookies';

const REFRESH_COOKIE = 'hb_refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: any) {
    const result = await this.authService.register(dto);
    this.setAuthCookies(res, result.refreshToken, result.user);
    const { refreshToken: _, ...body } = result;
    return body;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const result = await this.authService.login(dto);
    this.setAuthCookies(res, result.refreshToken, result.user);
    const { refreshToken: _, ...body } = result;
    return body;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get a new access token using the HttpOnly refresh cookie' })
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];

    // Primary path: standard refresh-token rotation via hb_refresh_token cookie.
    // On any failure (invalid JWT, DB record gone, P2025, etc.) fall through to the
    // hb_session fallback rather than returning a 500.
    if (refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync<{ sub: string }>(refreshToken, {
          secret: this.configService.get<string>('jwt.refreshSecret'),
        });
        const result = await this.authService.refreshTokens(payload.sub, refreshToken);
        this.setAuthCookies(res, result.refreshToken, result.user);
        return { accessToken: result.accessToken, user: result.user };
      } catch {
        // Fall through to hb_session fallback below.
      }
    }

    // Fallback: no refresh token cookie, or primary path failed (e.g. stale cookie, Secure
    // cookie rejected on HTTP localhost, or race-condition delete).  Accept a valid
    // hb_session JWT to issue a short-lived access token without token rotation.
    const sessionToken = req.cookies?.['hb_session'];
    if (sessionToken) {
      const sessionSecret =
        this.configService.get<string>('session.secret') ||
        process.env.SESSION_SECRET ||
        'healthbridge-dev-secret-key-change-in-production';
      let userId: string;
      try {
        const payload = await this.jwtService.verifyAsync<{ userId: string }>(sessionToken, {
          secret: sessionSecret,
        });
        userId = payload.userId;
      } catch {
        throw new UnauthorizedException('Invalid or expired session');
      }
      const result = await this.authService.issueAccessTokenForSession(userId);
      return result;
    }

    throw new UnauthorizedException('No refresh token');
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — revokes refresh token and clears cookie' })
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    this.clearAuthCookies(res);
    return this.authService.logout(userId, token);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Reset password using token from email' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address via token from email link' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Resend email verification link (public — accepts { email })' })
  resendVerification(@Body() dto: ForgotPasswordDto) {
    return this.authService.resendVerificationByEmail(dto.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resend-verification/me')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend email verification link (authenticated)' })
  resendVerificationMe(@CurrentUser('id') userId: string) {
    return this.authService.resendVerification(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for authenticated user' })
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto);
  }

  @Public()
  @Get('invite/verify')
  @ApiOperation({ summary: 'Verify invite token and return pre-filled doctor info' })
  verifyInvite(@Query('token') token: string) {
    return this.authService.verifyInvite(token);
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Accept doctor invitation — sets password and creates account' })
  async acceptInvite(
    @Body() body: { token: string; password: string },
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.authService.acceptInvite(body.token, body.password);
    this.setAuthCookies(res, result.refreshToken, result.user);
    const { refreshToken: _, ...response } = result;
    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: { id: string; email: string; role: string }) {
    return this.authService.me(user.id);
  }

  // ── Cookie helpers ────────────────────────────────────────────────────────

  setAuthCookies(res: any, refreshToken: string, user: { id: string; email: string; role: string; firstName: string; lastName: string }) {
    setAuthCookies(res, refreshToken, user, this.jwtService, this.configService);
  }

  private clearAuthCookies(res: any) {
    clearAuthCookies(res);
  }
}
