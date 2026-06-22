import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { paginate } from '../../common/utils/paginate';
import { PrismaService } from '../../database/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { AssignDoctorDto } from './dto/assign-doctor.dto';
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

  async findAll(
    pagination: PaginationParams,
    requesterId: string,
    requesterRole: Role,
    filters: { search?: string; hospitalId?: string; doctorId?: string } = {},
  ) {
    const { search, hospitalId, doctorId } = filters;

    const base: any = {
      ...(hospitalId ? { hospitalId } : {}),
      // Accept either the doctor record UUID or the doctor's user UUID
      ...(doctorId ? { assignedDoctor: { OR: [{ id: doctorId }, { userId: doctorId }] } } : {}),
      ...(search
        ? {
            OR: [
              { user: { firstName: { contains: search, mode: 'insensitive' } } },
              { user: { lastName: { contains: search, mode: 'insensitive' } } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const where = requesterRole === Role.PATIENT ? { ...base, userId: requesterId } : base;

    const include = {
      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      hospital: { select: { name: true } },
      assignedDoctor: { include: { user: { select: { firstName: true, lastName: true } } } },
      visits: { take: 1, orderBy: { startTime: 'desc' as const }, select: { startTime: true } },
    };

    const [raw, total] = await Promise.all([
      this.prisma.patient.findMany({ where, skip: pagination.skip, take: pagination.limit, orderBy: { createdAt: 'desc' }, include }),
      this.prisma.patient.count({ where }),
    ]);

    const data = raw.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: `${p.user.firstName} ${p.user.lastName}`,
      email: p.user.email,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      bloodType: p.bloodType,
      hospitalName: p.hospital?.name ?? null,
      assignedDoctorName: p.assignedDoctor
        ? `Dr. ${p.assignedDoctor.user.firstName} ${p.assignedDoctor.user.lastName}`
        : null,
      lastVisit: p.visits[0]?.startTime ?? null,
    }));

    return paginate(data, total, pagination);
  }

  async findMe(requesterId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId: requesterId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        hospital: { select: { id: true, name: true } },
        assignedDoctor: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!patient) throw new NotFoundException('No patient profile found for this account. Create one first.');
    return this.flattenPatient(patient);
  }

  async findOne(id: string, requesterId: string, requesterRole: Role) {
    const cacheKey = `patient:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        hospital: { select: { id: true, name: true } },
        assignedDoctor: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!patient) throw new NotFoundException(`Patient ${id} not found`);
    this.canAccessPatient(patient, requesterId, requesterRole);

    const flat = this.flattenPatient(patient);
    await this.redis.set(cacheKey, JSON.stringify(flat), PATIENT_CACHE_TTL);
    return flat;
  }

  private flattenPatient(p: any) {
    return {
      id: p.id,
      userId: p.userId,
      name: `${p.user.firstName} ${p.user.lastName}`,
      email: p.user.email,
      phone: p.user.phone,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      bloodType: p.bloodType,
      allergies: p.allergies,
      emergencyContact: p.emergencyContact,
      hospitalId: p.hospitalId,
      hospitalName: p.hospital?.name ?? null,
      assignedDoctorId: p.assignedDoctorId,
      assignedDoctorName: p.assignedDoctor
        ? `Dr. ${p.assignedDoctor.user.firstName} ${p.assignedDoctor.user.lastName}`
        : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
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

  async assignDoctor(patientId: string, dto: AssignDoctorDto, requesterId: string, requesterRole: Role) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException(`Patient ${patientId} not found`);

    if (requesterRole === Role.PATIENT) throw new ForbiddenException('Patients cannot assign doctors');

    const doctor = await this.prisma.doctor.findUnique({ where: { id: dto.doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (doctor.hospitalId !== patient.hospitalId) {
      throw new BadRequestException('Doctor must belong to the same hospital as the patient');
    }

    const updated = await this.prisma.patient.update({
      where: { id: patientId },
      data: { assignedDoctorId: dto.doctorId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        assignedDoctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
      },
    });

    await this.redis.del(`patient:${patientId}`);
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



