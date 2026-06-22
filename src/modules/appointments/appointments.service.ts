import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { paginate } from '../../common/utils/paginate';
import { PrismaService } from '../../database/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { Role, AppointmentStatus } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateAppointmentDto, requesterId: string, requesterRole: Role) {
    // Accept either the record UUID or the user UUID — the frontend may send either
    const [patient, doctor, hospital] = await Promise.all([
      this.prisma.patient.findFirst({
        where: { OR: [{ id: dto.patientId }, { userId: dto.patientId }] },
        include: { user: true },
      }),
      this.prisma.doctor.findFirst({
        where: { OR: [{ id: dto.doctorId }, { userId: dto.doctorId }] },
        include: { user: true },
      }),
      this.prisma.hospital.findUnique({ where: { id: dto.hospitalId } }),
    ]);

    if (!patient) throw new NotFoundException('Patient not found');
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (!hospital) throw new NotFoundException('Hospital not found');

    if (requesterRole === Role.PATIENT && patient.userId !== requesterId) {
      throw new ForbiddenException('You can only book appointments for yourself');
    }

    if (doctor.hospitalId !== dto.hospitalId) {
      throw new BadRequestException('Doctor does not belong to the specified hospital');
    }

    const conflict = await this.prisma.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        scheduledAt: new Date(dto.scheduledAt),
        status: { notIn: [AppointmentStatus.CANCELLED] },
      },
    });
    if (conflict) throw new BadRequestException('This time slot is already booked');

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        hospitalId: dto.hospitalId,
        title: dto.title,
        reason: dto.reason,
        type: dto.type,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes ?? 30,
        notes: dto.notes,
      },
      include: {
        patient: { include: { user: { select: { firstName: true, lastName: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true } },
      },
    });

    await Promise.all([
      this.notifications.create(patient.userId, {
        title: 'Appointment Booked',
        message: `Your appointment with Dr. ${doctor.user.lastName} on ${new Date(dto.scheduledAt).toLocaleString()} has been booked.`,
        type: 'appointment',
        link: `/appointments/${appointment.id}`,
      }),
      this.notifications.create(doctor.userId, {
        title: 'New Appointment',
        message: `New appointment with ${patient.user.firstName} ${patient.user.lastName} on ${new Date(dto.scheduledAt).toLocaleString()}.`,
        type: 'appointment',
        link: `/appointments/${appointment.id}`,
      }),
    ]);

    return appointment;
  }

  async findAll(
    pagination: PaginationParams,
    requesterId: string,
    requesterRole: Role,
    filters: { status?: AppointmentStatus; patientId?: string; doctorId?: string; hospitalId?: string; from?: string; to?: string },
  ) {
    const where: any = this.buildWhere(requesterId, requesterRole, filters);

    const [raw, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          hospital: { select: { name: true } },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return paginate(raw.map(this.formatAppointment), total, pagination);
  }

  async findOne(id: string, requesterId: string, requesterRole: Role) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        hospital: { select: { name: true, address: true } },
      },
    });

    if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);
    this.assertAccess(appointment as any, requesterId, requesterRole);
    return appointment;
  }

  async update(id: string, dto: UpdateAppointmentDto, requesterId: string, requesterRole: Role) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
    });
    if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);
    this.assertAccess(appointment as any, requesterId, requesterRole);

    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...dto,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  async updateStatus(id: string, status: AppointmentStatus, requesterId: string, requesterRole: Role) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
    });
    if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);

    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      [AppointmentStatus.PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
      [AppointmentStatus.CONFIRMED]: [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED],
      [AppointmentStatus.CANCELLED]: [],
      [AppointmentStatus.COMPLETED]: [],
      [AppointmentStatus.NO_SHOW]: [],
    };

    if (!validTransitions[appointment.status].includes(status)) {
      throw new BadRequestException(`Cannot transition from ${appointment.status} to ${status}`);
    }

    const updated = await this.prisma.appointment.update({ where: { id }, data: { status } });

    if (status === AppointmentStatus.CONFIRMED) {
      await this.notifications.create(appointment.patient.userId, {
        title: 'Appointment Confirmed',
        message: `Your appointment on ${appointment.scheduledAt.toLocaleString()} has been confirmed.`,
        type: 'appointment',
        link: `/appointments/${id}`,
      });
    }

    return updated;
  }

  async cancel(id: string, requesterId: string, requesterRole: Role) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
    });
    if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed appointment');
    }

    if (requesterRole === Role.PATIENT && appointment.patient.userId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
    });

    const notifyUserId =
      requesterRole === Role.PATIENT ? appointment.doctor.userId : appointment.patient.userId;

    await this.notifications.create(notifyUserId, {
      title: 'Appointment Cancelled',
      message: `The appointment on ${appointment.scheduledAt.toLocaleString()} has been cancelled.`,
      type: 'appointment',
    });

    return updated;
  }

  async remove(id: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException(`Appointment ${id} not found`);
    await this.prisma.appointment.delete({ where: { id } });
    return { message: 'Appointment deleted' };
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

    const [raw, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          hospital: { select: { name: true } },
        },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return paginate(raw.map(this.formatAppointment), total, pagination);
  }

  private formatAppointment(a: any) {
    return {
      id: a.id,
      patientId: a.patientId,
      patientName: a.patient ? `${a.patient.user.firstName} ${a.patient.user.lastName}` : null,
      doctorId: a.doctorId,
      doctorName: a.doctor ? `Dr. ${a.doctor.user.firstName} ${a.doctor.user.lastName}` : null,
      hospitalId: a.hospitalId,
      hospitalName: a.hospital?.name ?? null,
      title: a.title,
      reason: a.reason,
      type: a.type,
      status: a.status,
      scheduledAt: a.scheduledAt,
      duration: a.durationMinutes,
      notes: a.notes,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  private buildWhere(
    requesterId: string,
    role: Role,
    filters: { status?: AppointmentStatus; patientId?: string; doctorId?: string; hospitalId?: string; from?: string; to?: string },
  ) {
    const { status, patientId, doctorId, hospitalId, from, to } = filters;
    const dateFilter = (from || to) ? {
      scheduledAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lt: new Date(to) } : {}),
      },
    } : {};

    const base = {
      ...(status ? { status } : {}),
      // Accept either patient record UUID or user UUID
      ...(patientId ? { patient: { OR: [{ id: patientId }, { userId: patientId }] } } : {}),
      // Accept either doctor record UUID or user UUID
      ...(doctorId ? { doctor: { OR: [{ id: doctorId }, { userId: doctorId }] } } : {}),
      ...(hospitalId ? { hospitalId } : {}),
      ...dateFilter,
    };

    if (role === Role.ADMIN) return base;
    if (role === Role.DOCTOR) {
      // Strip any explicit doctor relation filter so the role guard is the sole authority
      const { doctor: _d, ...rest } = base as any;
      return { ...rest, doctor: { userId: requesterId } };
    }
    const { patient: _p, ...rest } = base as any;
    return { ...rest, patient: { userId: requesterId } };
  }

  private assertAccess(
    appointment: { patient?: { user?: { id?: string } }; doctor?: { userId?: string } },
    requesterId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;
    if (role === Role.DOCTOR && appointment.doctor?.userId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
    if (role === Role.PATIENT && appointment.patient?.user?.id !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
  }
}



