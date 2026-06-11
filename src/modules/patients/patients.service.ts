import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Role } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';
import { RedisService } from '../redis/redis.service';

const PATIENT_CACHE_TTL = 300;

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async create(dto: CreatePatientDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.PATIENT) throw new BadRequestException('User must have PATIENT role');

    const existing = await this.prisma.patient.findUnique({ where: { userId: dto.userId } });
    if (existing) throw new ConflictException('Patient profile already exists for this user');

    const hospital = await this.prisma.hospital.findUnique({ where: { id: dto.hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');

    return this.prisma.patient.create({
      data: {
        userId: dto.userId,
        hospitalId: dto.hospitalId,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        bloodType: dto.bloodType,
        allergies: dto.allergies ?? [],
        emergencyContact: dto.emergencyContact,
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        hospital: { select: { name: true } },
      },
    });
  }

  async findAll(pagination: PaginationParams, requesterId: string, requesterRole: Role) {
    const where = requesterRole === Role.PATIENT ? { userId: requesterId } : {};

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          hospital: { select: { name: true } },
          _count: { select: { records: true } },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) },
    };
  }

  async findMe(requesterId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId: requesterId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        hospital: { select: { id: true, name: true, address: true } },
        records: {
          take: 5,
          orderBy: { visitDate: 'desc' },
          select: { id: true, title: true, visitDate: true, status: true },
        },
      },
    });

    if (!patient) throw new NotFoundException('No patient profile found for this account. Create one first.');
    return patient;
  }

  async findOne(id: string, requesterId: string, requesterRole: Role) {
    const cacheKey = `patient:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        hospital: { select: { id: true, name: true, address: true } },
        records: {
          take: 5,
          orderBy: { visitDate: 'desc' },
          select: { id: true, title: true, visitDate: true, status: true },
        },
      },
    });

    if (!patient) throw new NotFoundException(`Patient ${id} not found`);

    this.canAccessPatient(patient, requesterId, requesterRole);
    await this.redis.set(cacheKey, JSON.stringify(patient), PATIENT_CACHE_TTL);
    return patient;
  }

  async update(id: string, dto: UpdatePatientDto, requesterId: string, requesterRole: Role) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException(`Patient ${id} not found`);
    this.canAccessPatient(patient, requesterId, requesterRole);

    if (dto.hospitalId) {
      const hospital = await this.prisma.hospital.findUnique({ where: { id: dto.hospitalId } });
      if (!hospital) throw new NotFoundException('Hospital not found');
    }

    const updated = await this.prisma.patient.update({
      where: { id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        hospital: { select: { name: true } },
      },
    });

    await this.redis.del(`patient:${id}`);
    return updated;
  }

  async remove(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException(`Patient ${id} not found`);
    await this.prisma.patient.delete({ where: { id } });
    await this.redis.del(`patient:${id}`);
    return { message: `Patient ${id} deleted` };
  }

  private canAccessPatient(
    patient: { userId: string; hospitalId: string },
    requesterId: string,
    requesterRole: Role,
  ) {
    if (requesterRole === Role.ADMIN) return;
    if (requesterRole === Role.PATIENT && patient.userId !== requesterId) {
      throw new ForbiddenException('Access denied to this patient record');
    }
  }
}
