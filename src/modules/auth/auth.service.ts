import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Role } from '@prisma/client';

const SALT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const role = dto.role ?? Role.PATIENT;
    const hashed = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
    });

    if (role === Role.PATIENT && dto.hospitalId) {
      const hospital = await this.prisma.hospital.findUnique({ where: { id: dto.hospitalId } });
      if (hospital) {
        await this.prisma.patient.create({
          data: { userId: user.id, hospitalId: dto.hospitalId },
        });
      }
    }

    await this.sendVerificationEmail(user.id, user.email, user.firstName);

    const tokens = await this.issueTokenPair(user.id, user.email, user.role);
    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const lockKey = `login:locked:${dto.email}`;
    const failKey = `login:failed:${dto.email}`;

    // Check if account is locked
    const locked = await this.redis.get(lockKey);
    if (locked) {
      const ttl = await this.redis.getClient().ttl(lockKey);
      throw new HttpException(
        `Too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Generic message to prevent user enumeration
    if (!user || !user.isActive) {
      await this.recordFailedAttempt(failKey, lockKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      await this.recordFailedAttempt(failKey, lockKey);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isEmailVerified) {
      throw new HttpException(
        'Please verify your email before logging in. Check your inbox or request a new link.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Successful login — clear any failed attempt counter
    await this.redis.del(failKey);
    await this.redis.del(lockKey);

    const tokens = await this.issueTokenPair(user.id, user.email, user.role);
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      ...tokens,
    };
  }

  async refreshTokens(userId: string, incomingRefreshToken: string) {
    let payload: { sub: string; email: string; role: Role };
    try {
      payload = await this.jwtService.verifyAsync(incomingRefreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.sub !== userId) throw new UnauthorizedException('Token mismatch');

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (!tokenRecord) throw new UnauthorizedException('Refresh token revoked');

    const tokenMatch = await bcrypt.compare(incomingRefreshToken, tokenRecord.token);
    if (!tokenMatch) throw new UnauthorizedException('Refresh token invalid');

    await this.prisma.refreshToken.delete({ where: { id: tokenRecord.id } });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    const tokens = await this.issueTokenPair(user.id, user.email, user.role);
    const { isActive: _, ...safeUser } = user;
    return { ...tokens, user: safeUser };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        patient: { select: { id: true, hospitalId: true, assignedDoctorId: true } },
        doctor: { select: { id: true, hospitalId: true, specialization: true } },
      },
    });
    if (!user) throw new Error('User not found');
    return user;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always return the same response to prevent email enumeration
    if (!user || !user.isActive) return { message: 'If that email exists, a reset link has been sent.' };

    // Invalidate any existing unused tokens for this user
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token: hashedToken, expiresAt },
    });

    const frontendUrl = process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:3001';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    this.mail.sendPasswordReset(user.email, user.firstName, resetUrl).catch((err) =>
      this.logger.error('Failed to send password reset email', err),
    );

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const hashedToken = crypto.createHash('sha256').update(dto.token).digest('hex');

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.prisma.$transaction([
      // Mark token as used
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Update password
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword },
      }),
      // Revoke all active sessions
      this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    return { message: 'Password reset successful. Please log in with your new password.' };
  }

  async logout(userId: string, incomingRefreshToken?: string) {
    if (incomingRefreshToken) {
      const tokens = await this.prisma.refreshToken.findMany({ where: { userId } });
      for (const t of tokens) {
        const match = await bcrypt.compare(incomingRefreshToken, t.token);
        if (match) {
          await this.prisma.refreshToken.deleteMany({ where: { id: t.id } });
          break;
        }
      }
    } else {
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
    return { message: 'Logged out successfully' };
  }

  async verifyEmail(token: string) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token: hashedToken },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Verification link is invalid or has expired');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true, emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    return { message: 'Email verified successfully. You can now log in.' };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('Email is already verified');

    await this.sendVerificationEmail(user.id, user.email, user.firstName);
    return { message: 'Verification email sent.' };
  }

  async resendVerificationByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Same response regardless — prevents email enumeration
    if (!user || !user.isActive || user.isEmailVerified) {
      return { message: 'If that email exists and is unverified, a new link has been sent.' };
    }

    await this.sendVerificationEmail(user.id, user.email, user.firstName);
    return { message: 'If that email exists and is unverified, a new link has been sent.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const match = await bcrypt.compare(dto.currentPassword, user.password);
    if (!match) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current password');
    }

    const hashed = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { password: hashed } }),
      // Revoke all sessions so other devices must re-login
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    return { message: 'Password changed successfully. Please log in again.' };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async sendVerificationEmail(userId: string, email: string, firstName: string) {
    await this.prisma.emailVerificationToken.deleteMany({ where: { userId } });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.emailVerificationToken.create({
      data: { userId, token: hashedToken, expiresAt },
    });

    const frontendUrl = process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:3001';
    const verifyUrl = `${frontendUrl}/verify-email?token=${rawToken}`;
    this.mail.sendEmailVerification(email, firstName, verifyUrl).catch((err) =>
      this.logger.error('Failed to send verification email', err),
    );
  }

  private async recordFailedAttempt(failKey: string, lockKey: string) {
    const attempts = await this.redis.incr(failKey);
    if (attempts === 1) {
      // Start the window on first failure
      await this.redis.expire(failKey, LOCKOUT_SECONDS);
    }
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await this.redis.set(lockKey, '1', LOCKOUT_SECONDS);
      await this.redis.del(failKey);
    }
  }

  async verifyInvite(token: string) {
    const raw = await this.redis.get(`invite:${token}`);
    if (!raw) throw new HttpException('Invitation link has expired or is invalid', HttpStatus.GONE);
    const { invitedById: _, ...data } = JSON.parse(raw);
    return data;
  }

  async acceptInvite(token: string, password: string) {
    const raw = await this.redis.get(`invite:${token}`);
    if (!raw) throw new BadRequestException('Invitation link is invalid or has expired');

    const invite = JSON.parse(raw);

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) throw new ConflictException('An account already exists for this email');

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        password: hashedPassword,
        role: Role.DOCTOR,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    await this.prisma.doctor.create({
      data: {
        userId: user.id,
        hospitalId: invite.hospitalId,
        specialization: invite.specialization,
        licenseNumber: invite.licenseNumber,
      },
    });

    await this.redis.del(`invite:${token}`);

    const tokens = await this.issueTokenPair(user.id, user.email, user.role);
    return {
      message: 'Account created successfully.',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    };
  }

  private async issueTokenPair(userId: string, email: string, role: Role) {
    const payload = { sub: userId, email, role };

    const accessSecret = this.configService.get<string>('jwt.accessSecret')!;
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret')!;
    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn')!;
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn')!;

    const [accessToken, refreshToken] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.jwtService.signAsync(payload, { secret: accessSecret, expiresIn: accessExpiresIn as any }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.jwtService.signAsync(payload, { secret: refreshSecret, expiresIn: refreshExpiresIn as any }),
    ]);

    const hashedRefresh = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token: hashedRefresh, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
