import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashed,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role ?? Role.PATIENT,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    const tokens = await this.issueTokenPair(user.id, user.email, user.role);
    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

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
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    return this.issueTokenPair(user.id, user.email, user.role);
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

  async logout(userId: string, incomingRefreshToken?: string) {
    if (incomingRefreshToken) {
      const tokens = await this.prisma.refreshToken.findMany({ where: { userId } });
      for (const t of tokens) {
        const match = await bcrypt.compare(incomingRefreshToken, t.token);
        if (match) {
          await this.prisma.refreshToken.delete({ where: { id: t.id } });
          break;
        }
      }
    } else {
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
    return { message: 'Logged out successfully' };
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
