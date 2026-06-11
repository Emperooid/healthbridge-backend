import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { Role } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class RecordsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateRecordDto, requesterId: string) {
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

    const record = await this.prisma.medicalRecord.create({
      data: {
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        hospitalId: dto.hospitalId,
        title: dto.title,
        description: dto.description,
        diagnosis: dto.diagnosis,
        treatment: dto.treatment,
        prescription: dto.prescription,
        status: dto.status,
        visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
      },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
      },
    });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.CREATE,
      resource: 'MedicalRecord',
      resourceId: record.id,
      details: { title: dto.title, patientId: dto.patientId },
    });

    return record;
  }

  async findAll(pagination: PaginationParams, requesterId: string, requesterRole: Role) {
    const where = this.buildWhereClause(requesterId, requesterRole);

    const [data, total] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { visitDate: 'desc' },
        include: {
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          hospital: { select: { name: true } },
          _count: { select: { files: true } },
        },
      }),
      this.prisma.medicalRecord.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) },
    };
  }

  async findOne(id: string, requesterId: string, requesterRole: Role) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      include: {
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true, address: true } },
        files: true,
      },
    });

    if (!record) throw new NotFoundException(`Record ${id} not found`);
    this.assertAccess(record, requesterId, requesterRole);

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.READ,
      resource: 'MedicalRecord',
      resourceId: id,
    });

    return record;
  }

  async update(id: string, dto: UpdateRecordDto, requesterId: string, requesterRole: Role) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      include: { patient: { include: { user: { select: { id: true } } } }, doctor: true },
    });
    if (!record) throw new NotFoundException(`Record ${id} not found`);
    this.assertAccess(record, requesterId, requesterRole);

    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: {
        ...dto,
        visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
      },
    });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.UPDATE,
      resource: 'MedicalRecord',
      resourceId: id,
      details: dto as Record<string, unknown>,
    });

    return updated;
  }

  async remove(id: string, requesterId: string) {
    const record = await this.prisma.medicalRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Record ${id} not found`);
    await this.prisma.medicalRecord.delete({ where: { id } });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.DELETE,
      resource: 'MedicalRecord',
      resourceId: id,
    });

    return { message: `Record ${id} deleted` };
  }

  async findMine(pagination: PaginationParams, requesterId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
    if (!patient) throw new NotFoundException('No patient profile found for this account.');

    const [data, total] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where: { patientId: patient.id },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { visitDate: 'desc' },
        include: {
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          hospital: { select: { name: true } },
          _count: { select: { files: true } },
        },
      }),
      this.prisma.medicalRecord.count({ where: { patientId: patient.id } }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) },
    };
  }

  async findByPatient(patientId: string, pagination: PaginationParams, requesterId: string, requesterRole: Role) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    if (requesterRole === Role.PATIENT && patient.userId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }

    const [data, total] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where: { patientId },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { visitDate: 'desc' },
        include: {
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          hospital: { select: { name: true } },
          _count: { select: { files: true } },
        },
      }),
      this.prisma.medicalRecord.count({ where: { patientId } }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) },
    };
  }

  private buildWhereClause(requesterId: string, role: Role) {
    if (role === Role.ADMIN) return {};
    if (role === Role.DOCTOR) {
      return { doctor: { userId: requesterId } };
    }
    return { patient: { userId: requesterId } };
  }

  private assertAccess(
    record: { patient: { user: { id: string } }; doctor: { userId: string } },
    requesterId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;
    if (role === Role.DOCTOR && record.doctor.userId !== requesterId) {
      throw new ForbiddenException('Access denied to this record');
    }
    if (role === Role.PATIENT && record.patient.user.id !== requesterId) {
      throw new ForbiddenException('Access denied to this record');
    }
  }
}
