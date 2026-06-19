import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateRoleDto, UpdateUserStatusDto } from './dto/update-user.dto';
import { InviteDoctorDto, AcceptInviteDto } from './dto/invite-doctor.dto';
import { Role } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const INVITE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private redis: RedisService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: { ...dto, password: hashed },
      select: SAFE_USER_SELECT,
    });
  }

  async findAll(pagination: PaginationParams) {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        select: SAFE_USER_SELECT,
      }),
      this.prisma.user.count(),
    ]);
    return { data, meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) } };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto, requesterId: string, requesterRole: Role) {
    await this.findOne(id);
    if (requesterId !== id && requesterRole !== Role.ADMIN) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.prisma.user.update({ where: { id }, data: dto, select: SAFE_USER_SELECT });
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { role: dto.role }, select: SAFE_USER_SELECT });
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { isActive: dto.isActive }, select: SAFE_USER_SELECT });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: `User ${id} deleted` };
  }

  async inviteDoctor(dto: InviteDoctorDto, invitedById: string) {
    const [existing, hospital, licenseConflict] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.hospital.findUnique({ where: { id: dto.hospitalId } }),
      this.prisma.doctor.findUnique({ where: { licenseNumber: dto.licenseNumber } }),
    ]);
    if (existing) throw new ConflictException('A user with this email already exists');
    if (!hospital) throw new NotFoundException('Hospital not found');
    if (licenseConflict) throw new ConflictException('License number already in use');

    const token = crypto.randomBytes(32).toString('hex');
    const payload = JSON.stringify({ ...dto, invitedById });
    await this.redis.set(`invite:${token}`, payload, INVITE_TTL);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    this.mail.sendDoctorInvite(dto.email, dto.firstName, hospital.name, `${frontendUrl}/accept-invite?token=${token}`)
      .catch(() => undefined);

    return { message: `Invitation sent to ${dto.email}` };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const raw = await this.redis.get(`invite:${dto.token}`);
    if (!raw) throw new BadRequestException('Invitation link is invalid or has expired');

    const invite: InviteDoctorDto & { invitedById: string } = JSON.parse(raw);

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) throw new ConflictException('Account already exists for this email');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

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
      select: SAFE_USER_SELECT,
    });

    await this.prisma.doctor.create({
      data: {
        userId: user.id,
        hospitalId: invite.hospitalId,
        specialization: invite.specialization,
        licenseNumber: invite.licenseNumber,
      },
    });

    await this.redis.del(`invite:${dto.token}`);

    return { message: 'Account created successfully. You can now log in.', user };
  }
}
