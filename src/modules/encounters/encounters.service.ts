import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { paginate } from '../../common/utils/paginate';
import { PrismaService } from '../../database/prisma.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterDto } from './dto/update-encounter.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, Role, VisitStatus } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';

@Injectable()
export class EncountersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // â”€â”€â”€ Visits â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async createVisit(dto: CreateVisitDto, requesterId: string) {
    const [patient, doctor, hospital] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: dto.patientId } }),
      this.prisma.doctor.findUnique({ where: { id: dto.doctorId } }),
      this.prisma.hospital.findUnique({ where: { id: dto.hospitalId } }),
    ]);

    if (!patient) throw new NotFoundException('Patient not found');
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (!hospital) throw new NotFoundException('Hospital not found');

    if (doctor.hospitalId !== dto.hospitalId) {
      throw new BadRequestException('Doctor does not belong to the specified hospital');
    }

    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept || dept.hospitalId !== dto.hospitalId) {
        throw new BadRequestException('Department not found in this hospital');
      }
    }

    const visit = await this.prisma.visit.create({
      data: {
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        hospitalId: dto.hospitalId,
        departmentId: dto.departmentId,
        reason: dto.reason,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
      },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
        department: { select: { name: true } },
      },
    });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.CREATE,
      resource: 'Visit',
      resourceId: visit.id,
      details: { patientId: dto.patientId, reason: dto.reason },
    });

    return visit;
  }

  async findAllVisits(
    pagination: PaginationParams,
    requesterId: string,
    requesterRole: Role,
    filters: { patientId?: string; doctorId?: string; status?: VisitStatus },
  ) {
    const where = this.buildVisitWhere(requesterId, requesterRole, filters);

    const [data, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { startTime: 'desc' },
        include: {
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          hospital: { select: { name: true } },
          department: { select: { name: true } },
          _count: { select: { encounters: true } },
        },
      }),
      this.prisma.visit.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  async findOneVisit(id: string, requesterId: string, requesterRole: Role) {
    const visit = await this.prisma.visit.findUnique({
      where: { id },
      include: {
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true, address: true } },
        department: { select: { name: true } },
        encounters: true,
        prescriptions: { where: { status: 'ACTIVE' }, select: { id: true, drug: true, dosage: true, frequency: true } },
        labOrders: { select: { id: true, tests: true, status: true } },
      },
    });

    if (!visit) throw new NotFoundException(`Visit ${id} not found`);
    this.assertVisitAccess(visit as any, requesterId, requesterRole);
    return visit;
  }

  async updateVisit(id: string, dto: UpdateVisitDto, requesterId: string, requesterRole: Role) {
    const visit = await this.prisma.visit.findUnique({
      where: { id },
      include: { patient: { include: { user: true } }, doctor: true },
    });
    if (!visit) throw new NotFoundException(`Visit ${id} not found`);
    this.assertVisitAccess(visit as any, requesterId, requesterRole);

    if (visit.status === VisitStatus.COMPLETED || visit.status === VisitStatus.CANCELLED) {
      throw new BadRequestException(`Cannot update a ${visit.status} visit`);
    }

    const data: any = {};
    if (dto.status) data.status = dto.status;
    if (dto.endTime) data.endTime = new Date(dto.endTime);
    if (dto.status === VisitStatus.COMPLETED && !dto.endTime) data.endTime = new Date();

    return this.prisma.visit.update({ where: { id }, data });
  }

  // â”€â”€â”€ Encounters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async createEncounter(dto: CreateEncounterDto, requesterId: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id: dto.visitId } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.status !== VisitStatus.IN_PROGRESS) {
      throw new BadRequestException('Can only add encounters to an in-progress visit');
    }

    const encounter = await this.prisma.encounter.create({
      data: {
        visitId: dto.visitId,
        chiefComplaint: dto.chiefComplaint,
        examination: dto.examination,
        diagnosis: dto.diagnosis,
        notes: dto.notes,
        vitalSigns: dto.vitalSigns as any,
      },
    });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.CREATE,
      resource: 'Encounter',
      resourceId: encounter.id,
      details: { visitId: dto.visitId },
    });

    return encounter;
  }

  async findEncountersByVisit(visitId: string, requesterId: string, requesterRole: Role) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { patient: { include: { user: true } }, doctor: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    this.assertVisitAccess(visit as any, requesterId, requesterRole);

    return this.prisma.encounter.findMany({
      where: { visitId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateEncounter(id: string, dto: UpdateEncounterDto, requesterId: string) {
    const encounter = await this.prisma.encounter.findUnique({ where: { id } });
    if (!encounter) throw new NotFoundException(`Encounter ${id} not found`);

    const updated = await this.prisma.encounter.update({
      where: { id },
      data: { ...dto, vitalSigns: dto.vitalSigns as any },
    });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.UPDATE,
      resource: 'Encounter',
      resourceId: id,
    });

    return updated;
  }

  private buildVisitWhere(
    requesterId: string,
    role: Role,
    filters: { patientId?: string; doctorId?: string; status?: VisitStatus },
  ) {
    const { patientId, doctorId, status } = filters;
    const base = {
      ...(patientId ? { patientId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(status ? { status } : {}),
    };
    if (role === Role.ADMIN) return base;
    if (role === Role.DOCTOR) return { ...base, doctor: { userId: requesterId } };
    return { ...base, patient: { userId: requesterId } };
  }

  private assertVisitAccess(
    visit: { patient?: { user?: { id?: string } }; doctor?: { userId?: string } },
    requesterId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;
    if (role === Role.DOCTOR && visit.doctor?.userId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
    if (role === Role.PATIENT && visit.patient?.user?.id !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
  }
}



