import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Role } from '@prisma/client';

const mockPrisma = {
  patient: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  user: { findUnique: jest.fn() },
  hospital: { findUnique: jest.fn() },
  doctor: { findUnique: jest.fn() },
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};

const pagination = { skip: 0, limit: 10, page: 1 };

describe('PatientsService', () => {
  let service: PatientsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();
    service = module.get<PatientsService>(PatientsService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates patient profile successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: Role.PATIENT });
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrisma.patient.create.mockResolvedValue({ id: 'p-1', userId: 'u-1' });

      const result = await service.create({ userId: 'u-1', hospitalId: 'h-1' });
      expect(result.id).toBe('p-1');
    });

    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.create({ userId: 'bad', hospitalId: 'h-1' })).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when user is not PATIENT role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: Role.DOCTOR });
      await expect(service.create({ userId: 'u-1', hospitalId: 'h-1' })).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when patient profile already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: Role.PATIENT });
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-existing' });

      await expect(service.create({ userId: 'u-1', hospitalId: 'h-1' })).rejects.toThrow(ConflictException);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns cached patient if available', async () => {
      const cached = { id: 'p-1', userId: 'u-1', hospitalId: 'h-1' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.findOne('p-1', 'u-1', Role.PATIENT);
      expect(result.id).toBe('p-1');
      expect(mockPrisma.patient.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when patient not found', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.findOne('bad-id', 'u-1', Role.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when patient accesses another patient record', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1', userId: 'other-user', hospitalId: 'h-1' });
      await expect(service.findOne('p-1', 'u-1', Role.PATIENT)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── assignDoctor ───────────────────────────────────────────────────────────

  describe('assignDoctor', () => {
    it('throws ForbiddenException when patient tries to assign their own doctor', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1', hospitalId: 'h-1' });

      await expect(
        service.assignDoctor('p-1', { doctorId: 'd-1' }, 'u-1', Role.PATIENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when doctor is from a different hospital', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1', hospitalId: 'h-1' });
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1', hospitalId: 'h-2' });

      await expect(
        service.assignDoctor('p-1', { doctorId: 'd-1' }, 'admin-id', Role.ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it('assigns doctor when same hospital', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1', hospitalId: 'h-1' });
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1', hospitalId: 'h-1' });
      mockPrisma.patient.update.mockResolvedValue({ id: 'p-1', assignedDoctorId: 'd-1' });

      const result = await service.assignDoctor('p-1', { doctorId: 'd-1' }, 'admin-id', Role.ADMIN);
      expect(result.assignedDoctorId).toBe('d-1');
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes patient and clears cache', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.patient.delete.mockResolvedValue({});

      const result = await service.remove('p-1');
      expect(result.message).toMatch(/deleted/i);
      expect(mockRedis.del).toHaveBeenCalledWith('patient:p-1');
    });

    it('throws NotFoundException when patient does not exist', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.remove('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
