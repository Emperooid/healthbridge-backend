import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role, AppointmentStatus } from '@prisma/client';

const mockPrisma = {
  patient: { findUnique: jest.fn() },
  doctor: { findUnique: jest.fn() },
  hospital: { findUnique: jest.fn() },
  appointment: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
};

const mockNotifications = { create: jest.fn().mockResolvedValue(undefined) };

const pagination = { skip: 0, limit: 10, page: 1 };

const basePatient = { id: 'p-1', userId: 'u-patient', hospitalId: 'h-1', user: { firstName: 'John', lastName: 'Doe', id: 'u-patient' } };
const baseDoctor = { id: 'd-1', userId: 'u-doctor', hospitalId: 'h-1', user: { firstName: 'Dr', lastName: 'Smith' } };
const baseHospital = { id: 'h-1', name: 'General Hospital' };

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<AppointmentsService>(AppointmentsService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { patientId: 'p-1', doctorId: 'd-1', hospitalId: 'h-1', title: 'Checkup', reason: 'Annual', scheduledAt: '2026-08-01T10:00:00Z' };

    it('creates appointment and sends notifications', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(basePatient);
      mockPrisma.doctor.findUnique.mockResolvedValue(baseDoctor);
      mockPrisma.hospital.findUnique.mockResolvedValue(baseHospital);
      mockPrisma.appointment.findFirst.mockResolvedValue(null);
      mockPrisma.appointment.create.mockResolvedValue({ id: 'appt-1', ...dto });

      const result = await service.create(dto, 'u-admin', Role.ADMIN);
      expect(result.id).toBe('appt-1');
      expect(mockNotifications.create).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when patient not found', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      mockPrisma.doctor.findUnique.mockResolvedValue(baseDoctor);
      mockPrisma.hospital.findUnique.mockResolvedValue(baseHospital);

      await expect(service.create(dto, 'u-admin', Role.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when patient books for someone else', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(basePatient);
      mockPrisma.doctor.findUnique.mockResolvedValue(baseDoctor);
      mockPrisma.hospital.findUnique.mockResolvedValue(baseHospital);

      await expect(service.create(dto, 'other-user', Role.PATIENT)).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when doctor is from different hospital', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(basePatient);
      mockPrisma.doctor.findUnique.mockResolvedValue({ ...baseDoctor, hospitalId: 'h-2' });
      mockPrisma.hospital.findUnique.mockResolvedValue(baseHospital);

      await expect(service.create(dto, 'u-admin', Role.ADMIN)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when time slot is already booked', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(basePatient);
      mockPrisma.doctor.findUnique.mockResolvedValue(baseDoctor);
      mockPrisma.hospital.findUnique.mockResolvedValue(baseHospital);
      mockPrisma.appointment.findFirst.mockResolvedValue({ id: 'existing-appt' });

      await expect(service.create(dto, 'u-admin', Role.ADMIN)).rejects.toThrow(BadRequestException);
    });
  });

  // ── updateStatus ───────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('confirms a pending appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1', status: AppointmentStatus.PENDING,
        patient: { userId: 'u-patient' }, doctor: { userId: 'u-doctor' },
        scheduledAt: new Date(),
      });
      mockPrisma.appointment.update.mockResolvedValue({ id: 'appt-1', status: AppointmentStatus.CONFIRMED });

      const result = await service.updateStatus('appt-1', AppointmentStatus.CONFIRMED, 'u-admin', Role.ADMIN);
      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
    });

    it('throws BadRequestException for invalid status transition', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1', status: AppointmentStatus.COMPLETED,
        patient: { userId: 'u-patient' }, doctor: { userId: 'u-doctor' },
        scheduledAt: new Date(),
      });

      await expect(
        service.updateStatus('appt-1', AppointmentStatus.CONFIRMED, 'u-admin', Role.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a confirmed appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1', status: AppointmentStatus.CONFIRMED,
        patient: { userId: 'u-patient', user: {} }, doctor: { userId: 'u-doctor', user: {} },
        scheduledAt: new Date(),
      });
      mockPrisma.appointment.update.mockResolvedValue({ id: 'appt-1', status: AppointmentStatus.CANCELLED });

      const result = await service.cancel('appt-1', 'u-admin', Role.ADMIN);
      expect(result.status).toBe(AppointmentStatus.CANCELLED);
    });

    it('throws BadRequestException when cancelling a completed appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1', status: AppointmentStatus.COMPLETED,
        patient: { userId: 'u-patient', user: {} }, doctor: { userId: 'u-doctor', user: {} },
        scheduledAt: new Date(),
      });

      await expect(service.cancel('appt-1', 'u-admin', Role.ADMIN)).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when patient cancels another patient\'s appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-1', status: AppointmentStatus.PENDING,
        patient: { userId: 'other-patient', user: {} }, doctor: { userId: 'u-doctor', user: {} },
        scheduledAt: new Date(),
      });

      await expect(service.cancel('appt-1', 'u-patient', Role.PATIENT)).rejects.toThrow(ForbiddenException);
    });
  });
});
