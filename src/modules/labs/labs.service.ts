import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { paginate } from '../../common/utils/paginate';
import { PrismaService } from '../../database/prisma.service';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { UpdateLabOrderDto } from './dto/update-lab-order.dto';
import { CreateLabResultDto } from './dto/create-lab-result.dto';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditAction, LabOrderStatus, Role } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';

@Injectable()
export class LabsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private notifications: NotificationsService,
  ) {}

  // ─── Lab Orders ───────────────────────────────────────────────────────────

  async createOrder(dto: CreateLabOrderDto, requesterId: string) {
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
      this.prisma.doctor.findUnique({ where: { id: resolvedDoctorId }, include: { user: { select: { firstName: true, lastName: true } } } }),
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

    const order = await this.prisma.labOrder.create({
      data: {
        patientId: patient.id,
        doctorId: resolvedDoctorId,
        hospitalId: resolvedHospitalId,
        visitId: dto.visitId,
        tests: dto.tests,
        notes: dto.notes,
      },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
      },
    });

    await Promise.all([
      this.auditService.log({
        userId: requesterId,
        action: AuditAction.CREATE,
        resource: 'LabOrder',
        resourceId: order.id,
        details: { tests: dto.tests, patientId: dto.patientId },
      }),
      this.notifications.create(patient.userId, {
        title: 'Lab Test Ordered',
        message: `Lab tests ordered: ${dto.tests.join(', ')}. Please visit the laboratory.`,
        type: 'lab',
      }),
    ]);

    return this.formatOrder(order);
  }

  async findAllOrders(
    pagination: PaginationParams,
    requesterId: string,
    requesterRole: Role,
    filters: { patientId?: string; status?: LabOrderStatus },
  ) {
    const where = this.buildOrderWhere(requesterId, requesterRole, filters);

    const [data, total] = await Promise.all([
      this.prisma.labOrder.findMany({
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
      this.prisma.labOrder.count({ where }),
    ]);

    return paginate(data.map(o => this.formatOrder(o)), total, pagination);
  }

  async findOneOrder(id: string, requesterId: string, requesterRole: Role) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id },
      include: {
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
        visit: { select: { id: true, reason: true } },
        results: true,
      },
    });

    if (!order) throw new NotFoundException(`Lab order ${id} not found`);
    this.assertOrderAccess(order as any, requesterId, requesterRole);

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.READ,
      resource: 'LabOrder',
      resourceId: id,
    });

    return {
      ...this.formatOrder(order),
      results: (order.results ?? []).map(r => this.formatResult(r)),
    };
  }

  async updateOrder(id: string, dto: UpdateLabOrderDto, requesterId: string) {
    const order = await this.prisma.labOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Lab order ${id} not found`);

    const updated = await this.prisma.labOrder.update({
      where: { id },
      data: dto,
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
      },
    });

    return this.formatOrder(updated);
  }

  // ─── Lab Results ──────────────────────────────────────────────────────────

  async addResult(dto: CreateLabResultDto, requesterId: string) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: dto.orderId },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
      },
    });
    if (!order) throw new NotFoundException('Lab order not found');

    if (order.status === LabOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot add results to a cancelled order');
    }

    // Accept either isAbnormal (boolean) or interpretation (enum string)
    const isAbnormal = dto.isAbnormal ?? (dto.interpretation === 'ABNORMAL' || dto.interpretation === 'CRITICAL') ?? false;

    const result = await this.prisma.labResult.create({
      data: {
        orderId: dto.orderId,
        testName: dto.testName,
        value: dto.value,
        unit: dto.unit,
        referenceRange: dto.referenceRange,
        isAbnormal,
        notes: dto.notes,
        reportFile: dto.fileUrl ?? dto.reportFile,
      },
    });

    // Auto-advance order status based on result count
    const resultCount = await this.prisma.labResult.count({ where: { orderId: dto.orderId } });
    if (resultCount >= order.tests.length) {
      await this.prisma.labOrder.update({
        where: { id: dto.orderId },
        data: { status: LabOrderStatus.COMPLETED },
      });
    } else if (order.status === LabOrderStatus.PENDING) {
      await this.prisma.labOrder.update({
        where: { id: dto.orderId },
        data: { status: LabOrderStatus.IN_PROGRESS },
      });
    }

    const doctorName = `Dr. ${order.doctor.user.firstName} ${order.doctor.user.lastName}`;
    const abnormalNote = isAbnormal ? ' ⚠️ Abnormal result detected.' : '';
    await Promise.all([
      this.notifications.create(order.patient.userId, {
        title: 'Lab Result Available',
        message: `Your ${dto.testName} result is now available.${abnormalNote}`,
        type: 'lab',
        link: `/labs/orders/${dto.orderId}`,
      }),
      this.notifications.create(order.doctor.userId, {
        title: 'Lab Result Posted',
        message: `${dto.testName} result posted for patient by ${doctorName}.${abnormalNote}`,
        type: 'lab',
        link: `/labs/orders/${dto.orderId}`,
      }),
      this.auditService.log({
        userId: requesterId,
        action: AuditAction.CREATE,
        resource: 'LabResult',
        resourceId: result.id,
        details: { orderId: dto.orderId, testName: dto.testName },
      }),
    ]);

    return this.formatResult(result);
  }

  async findResultsByOrder(orderId: string, requesterId: string, requesterRole: Role) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: { patient: { include: { user: true } }, doctor: true },
    });
    if (!order) throw new NotFoundException('Lab order not found');
    this.assertOrderAccess(order as any, requesterId, requesterRole);

    const results = await this.prisma.labResult.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    return results.map(r => this.formatResult(r));
  }

  // ─── Formatters ───────────────────────────────────────────────────────────

  private formatOrder(o: any) {
    return {
      id: o.id,
      patientId: o.patientId,
      patientName: o.patient
        ? `${o.patient.user.firstName} ${o.patient.user.lastName}`.trim()
        : null,
      doctorId: o.doctorId,
      doctorName: o.doctor
        ? `Dr. ${o.doctor.user.firstName} ${o.doctor.user.lastName}`.trim()
        : null,
      hospitalId: o.hospitalId,
      hospitalName: o.hospital?.name ?? null,
      visitId: o.visitId ?? null,
      tests: o.tests,
      status: o.status,
      notes: o.notes ?? null,
      orderedAt: o.createdAt,
      createdAt: o.createdAt,
    };
  }

  private formatResult(r: any) {
    return {
      id: r.id,
      orderId: r.orderId,
      testName: r.testName ?? null,
      value: r.value ?? null,
      unit: r.unit ?? null,
      referenceRange: r.referenceRange ?? null,
      interpretation: r.isAbnormal ? 'ABNORMAL' : 'NORMAL',
      fileUrl: r.reportFile ?? null,
      notes: r.notes ?? null,
      resultedAt: r.createdAt,
      createdAt: r.createdAt,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildOrderWhere(
    requesterId: string,
    role: Role,
    filters: { patientId?: string; status?: LabOrderStatus },
  ) {
    const { patientId, status } = filters;
    const base = {
      ...(patientId ? { patientId } : {}),
      ...(status ? { status } : {}),
    };
    if (role === Role.ADMIN) return base;
    if (role === Role.DOCTOR) {
      return { ...base, doctor: { userId: requesterId } };
    }
    const { patientId: _p, ...rest } = base as any;
    return { ...rest, patient: { userId: requesterId } };
  }

  private assertOrderAccess(
    order: { patient?: { user?: { id?: string } }; doctor?: { userId?: string } },
    requesterId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;
    if (role === Role.DOCTOR && order.doctor?.userId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
    if (role === Role.PATIENT && order.patient?.user?.id !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
