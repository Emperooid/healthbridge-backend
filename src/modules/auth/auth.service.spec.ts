import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { Role } from '@prisma/client';

const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  refreshToken: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
  passwordResetToken: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
  emailVerificationToken: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  getClient: jest.fn().mockReturnValue({ ttl: jest.fn().mockResolvedValue(900) }),
};

const mockMail = {
  sendEmailVerification: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('mock.jwt.token'),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      'jwt.accessSecret': 'access-secret',
      'jwt.refreshSecret': 'refresh-secret',
      'jwt.accessExpiresIn': '15m',
      'jwt.refreshExpiresIn': '7d',
    };
    return map[key];
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: MailService, useValue: mockMail },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates user, sends verification email, returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1', email: 'test@example.com', firstName: 'Test', lastName: 'User', role: Role.PATIENT,
      });
      mockPrisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailVerificationToken.create.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: 'test@example.com', password: 'Password1!', firstName: 'Test', lastName: 'User',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBeDefined();
      expect(mockMail.sendEmailVerification).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when email already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({ email: 'exists@example.com', password: 'Password1!', firstName: 'A', lastName: 'B' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    const verifiedUser = {
      id: 'user-1', email: 'test@example.com',
      password: bcrypt.hashSync('Password1!', 10),
      firstName: 'Test', lastName: 'User', role: Role.PATIENT,
      isActive: true, isEmailVerified: true,
    };

    it('returns tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(verifiedUser);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({ email: 'test@example.com', password: 'Password1!' });

      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('throws UnauthorizedException on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(verifiedUser);

      await expect(
        service.login({ email: 'test@example.com', password: 'WrongPass1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'Password1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws 403 when email not verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...verifiedUser, isEmailVerified: false });

      await expect(
        service.login({ email: 'test@example.com', password: 'Password1!' }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('throws 429 when account is locked', async () => {
      mockRedis.get.mockResolvedValueOnce('1');

      await expect(
        service.login({ email: 'test@example.com', password: 'Password1!' }),
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  // ── forgotPassword ─────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('always returns the same message regardless of whether email exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword({ email: 'nobody@example.com' });
      expect(result.message).toMatch(/if that email exists/i);
      expect(mockMail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('sends reset email when user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@example.com', firstName: 'Test', isActive: true,
      });
      mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.passwordResetToken.create.mockResolvedValue({});

      const result = await service.forgotPassword({ email: 'test@example.com' });
      expect(result.message).toMatch(/if that email exists/i);
      expect(mockMail.sendPasswordReset).toHaveBeenCalledTimes(1);
    });
  });

  // ── verifyEmail ────────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('throws BadRequestException for invalid token', async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for expired token', async () => {
      mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
        userId: 'user-1', expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyEmail('expired-token')).rejects.toThrow(BadRequestException);
    });
  });

  // ── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword', () => {
    const user = {
      id: 'user-1',
      password: bcrypt.hashSync('OldPass1!', 10),
    };

    it('throws UnauthorizedException on wrong current password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.changePassword('user-1', { currentPassword: 'WrongPass1!', newPassword: 'NewPass1!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when new password matches current', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.changePassword('user-1', { currentPassword: 'OldPass1!', newPassword: 'OldPass1!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates password and revokes sessions on success', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.changePassword('user-1', { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });
      expect(result.message).toMatch(/password changed/i);
    });
  });
});
