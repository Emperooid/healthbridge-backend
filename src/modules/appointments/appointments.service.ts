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
    const [patient, doctor, hospital] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: dto.patientId }, include: { user: true } }),
      this.prisma.doctor.findUnique({ where: { id: dto.doctorId }, include: { user: true } }),
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
        doctorId: dto.doctorId,
        scheduledAt: new Date(dto.scheduledAt),
        status: { notIn: [AppointmentStatus.CANCELLED] },
      },
    });
    if (conflict) throw new BadRequestException('This time slot is already booked');

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        doctorId: dto.doctorId,
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
    filters: { status?: AppointmentStatus; patientId?: string; doctorId?: string; from?: string; to?: string },
  ) {
    const where: any = this.buildWhere(requesterId, requesterRole, filters);

    const [data, total] = await Promise.all([
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

    return paginate(data, total, pagination);
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

    const [data, total] = await Promise.all([
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

    return paginate(data, total, pagination);
  }

  private buildWhere(
    requesterId: string,
    role: Role,
    filters: { status?: AppointmentStatus; patientId?: string; doctorId?: string; from?: string; to?: string },
  ) {
    const { status, patientId, doctorId, from, to } = filters;
    const dateFilter = (from || to) ? {
      scheduledAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    } : {};

    const base = {
      ...(status ? { status } : {}),
      ...(patientId ? { patientId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...dateFilter,
    };

    if (role === Role.ADMIN) return base;
    if (role === Role.DOCTOR) return { ...base, doctor: { userId: requesterId } };
    return { ...base, patient: { userId: requesterId } };
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



