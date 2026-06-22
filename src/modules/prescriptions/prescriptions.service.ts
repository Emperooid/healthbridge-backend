import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { paginate } from '../../common/utils/paginate';
import { PrismaService } from '../../database/prisma.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditAction, Role, PrescriptionStatus } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreatePrescriptionDto, requesterId: string) {
    // Resolve doctorId and hospitalId from the requesting doctor's profile if not supplied
    let resolvedDoctorId = dto.doctorId;
    let resolvedHospitalId = dto.hospitalId;

    if (!resolvedDoctorId || !resolvedHospitalId) {
      const doctorProfile = await this.prisma.doctor.findUnique({
        where: { userId: requesterId },
        select: { id: true, hospitalId: true },
      });
      if (!doctorProfile) throw new ForbiddenException('Doctor profile not found for this user');
      resolvedDoctorId = resolvedDoctorId ?? doctorProfile.id;
      resolvedHospitalId = resolvedHospitalId ?? doctorProfile.hospitalId;
    }

    const [patient, doctor, hospital] = await Promise.all([
      this.prisma.patient.findFirst({
        where: { OR: [{ id: dto.patientId }, { userId: dto.patientId }] },
        include: { user: true },
      }),
      this.prisma.doctor.findUnique({
        where: { id: resolvedDoctorId },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.hospital.findUnique({ where: { id: resolvedHospitalId } }),
    ]);

    if (!patient) throw new NotFoundException('Patient not found');
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (!hospital) throw new NotFoundException('Hospital not found');

    if (doctor.hospitalId !== resolvedHospitalId) {
      throw new BadRequestException('Doctor does not belong to the specified hospital');
    }

    if (dto.visitId) {
      const visit = await this.prisma.visit.findUnique({ where: { id: dto.visitId } });
      if (!visit) throw new NotFoundException('Visit not found');
    }

    const prescription = await this.prisma.prescription.create({
      data: {
        patientId: patient.id,
        doctorId: resolvedDoctorId,
        hospitalId: resolvedHospitalId,
        visitId: dto.visitId,
        drug: dto.drug,
        dosage: dto.dosage,
        frequency: dto.frequency,
        duration: dto.duration,
        instructions: dto.instructions,
      },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
      },
    });

    const doctorName = `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`;
    await Promise.all([
      this.auditService.log({
        userId: requesterId,
        action: AuditAction.CREATE,
        resource: 'Prescription',
        resourceId: prescription.id,
        details: { drug: dto.drug, patientId: dto.patientId },
      }),
      this.notifications.create(patient.userId, {
        title: 'New Prescription',
        message: `A prescription for ${dto.drug} has been issued by ${doctorName}.`,
        type: 'prescription',
      }),
    ]);

    return this.formatPrescription(prescription);
  }

  async findAll(
    pagination: PaginationParams,
    requesterId: string,
    requesterRole: Role,
    filters: { patientId?: string; doctorId?: string; status?: PrescriptionStatus },
  ) {
    const where = this.buildWhere(requesterId, requesterRole, filters);

    const [data, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          hospital: { select: { name: true } },
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return paginate(data.map(p => this.formatPrescription(p)), total, pagination);
  }

  async findMine(pagination: PaginationParams, requesterId: string, requesterRole: Role) {
    let where: any = {};

    if (requesterRole === Role.PATIENT) {
      const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
      if (!patient) throw new NotFoundException('No patient profile found');
      where = { patientId: patient.id };
    } else if (requesterRole === Role.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId: requesterId } });
      if (!doctor) throw new NotFoundException('No doctor profile found');
      where = { doctorId: doctor.id };
    }

    const [data, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          hospital: { select: { name: true } },
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return paginate(data.map(p => this.formatPrescription(p)), total, pagination);
  }

  async findOne(id: string, requesterId: string, requesterRole: Role) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
        visit: { select: { id: true, reason: true, startTime: true } },
      },
    });

    if (!prescription) throw new NotFoundException(`Prescription ${id} not found`);
    this.assertAccess(prescription as any, requesterId, requesterRole);
    return this.formatPrescription(prescription);
  }

  async update(id: string, dto: UpdatePrescriptionDto, requesterId: string, requesterRole: Role) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { patient: { include: { user: true } }, doctor: true },
    });
    if (!prescription) throw new NotFoundException(`Prescription ${id} not found`);
    this.assertAccess(prescription as any, requesterId, requesterRole);

    const updated = await this.prisma.prescription.update({
      where: { id },
      data: dto,
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
      },
    });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.UPDATE,
      resource: 'Prescription',
      resourceId: id,
      details: dto as Record<string, unknown>,
    });

    return this.formatPrescription(updated);
  }

  // ─── Formatter ────────────────────────────────────────────────────────────

  private formatPrescription(p: any) {
    return {
      id: p.id,
      patientId: p.patientId,
      patientName: p.patient
        ? `${p.patient.user.firstName} ${p.patient.user.lastName}`.trim()
        : null,
      doctorId: p.doctorId,
      doctorName: p.doctor
        ? `Dr. ${p.doctor.user.firstName} ${p.doctor.user.lastName}`.trim()
        : null,
      hospitalId: p.hospitalId,
      hospitalName: p.hospital?.name ?? null,
      visitId: p.visitId ?? null,
      drug: p.drug,
      dosage: p.dosage,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions ?? null,
      status: p.status,
      prescribedAt: p.createdAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildWhere(
    requesterId: string,
    role: Role,
    filters: { patientId?: string; doctorId?: string; status?: PrescriptionStatus },
  ) {
    const { patientId, doctorId, status } = filters;
    const base = {
      ...(patientId ? { patientId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(status ? { status } : {}),
    };
    if (role === Role.ADMIN) return base;
    if (role === Role.DOCTOR) {
      // Remove scalar doctorId so it doesn't conflict with the relation guard
      const { doctorId: _d, ...rest } = base as any;
      return { ...rest, doctor: { userId: requesterId } };
    }
    const { patientId: _p, ...rest } = base as any;
    return { ...rest, patient: { userId: requesterId } };
  }

  private assertAccess(
    prescription: { patient?: { user?: { id?: string } }; doctor?: { userId?: string } },
    requesterId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;
    if (role === Role.DOCTOR && prescription.doctor?.userId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
    if (role === Role.PATIENT && prescription.patient?.user?.id !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
