import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { RecordsService } from './records.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '@prisma/client';

const mockPrisma = {
  patient: { findUnique: jest.fn() },
  doctor: { findUnique: jest.fn() },
  hospital: { findUnique: jest.fn() },
  medicalRecord: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

const pagination = { skip: 0, limit: 10, page: 1 };

const adminRecord = {
  id: 'rec-1',
  patient: { user: { id: 'patient-user' } },
  doctor: { userId: 'doctor-user' },
};

describe('RecordsService', () => {
  let service: RecordsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<RecordsService>(RecordsService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('throws NotFoundException when patient not found', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1', hospitalId: 'h-1' });
      mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'h-1' });

      await expect(
        service.create({ patientId: 'bad', doctorId: 'd-1', hospitalId: 'h-1', title: 'T', description: 'D' }, 'u-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when doctor is from a different hospital', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1', hospitalId: 'h-2' });
      mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'h-1' });

      await expect(
        service.create({ patientId: 'p-1', doctorId: 'd-1', hospitalId: 'h-1', title: 'T', description: 'D' }, 'u-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates record and logs audit', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1', hospitalId: 'h-1' });
      mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrisma.medicalRecord.create.mockResolvedValue({ id: 'rec-1', title: 'Checkup' });

      const result = await service.create(
        { patientId: 'p-1', doctorId: 'd-1', hospitalId: 'h-1', title: 'Checkup', description: 'Routine' },
        'u-1',
      );
      expect(result.id).toBe('rec-1');
      expect(mockAudit.log).toHaveBeenCalledTimes(1);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when record not found', async () => {
      mockPrisma.medicalRecord.findUnique.mockResolvedValue(null);
      await expect(service.findOne('bad-id', 'u-1', Role.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('allows ADMIN to access any record', async () => {
      mockPrisma.medicalRecord.findUnique.mockResolvedValue(adminRecord);
      const result = await service.findOne('rec-1', 'any-user', Role.ADMIN);
      expect(result.id).toBe('rec-1');
    });

    it('throws ForbiddenException when doctor accesses another doctor\'s record', async () => {
      mockPrisma.medicalRecord.findUnique.mockResolvedValue(adminRecord);
      await expect(service.findOne('rec-1', 'other-doctor', Role.DOCTOR)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when patient accesses another patient\'s record', async () => {
      mockPrisma.medicalRecord.findUnique.mockResolvedValue(adminRecord);
      await expect(service.findOne('rec-1', 'other-patient', Role.PATIENT)).rejects.toThrow(ForbiddenException);
    });

    it('allows owning doctor to access their record', async () => {
      mockPrisma.medicalRecord.findUnique.mockResolvedValue(adminRecord);
      const result = await service.findOne('rec-1', 'doctor-user', Role.DOCTOR);
      expect(result.id).toBe('rec-1');
    });

    it('allows owning patient to access their record', async () => {
      mockPrisma.medicalRecord.findUnique.mockResolvedValue(adminRecord);
      const result = await service.findOne('rec-1', 'patient-user', Role.PATIENT);
      expect(result.id).toBe('rec-1');
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes record and logs audit', async () => {
      mockPrisma.medicalRecord.findUnique.mockResolvedValue({ id: 'rec-1' });
      mockPrisma.medicalRecord.delete.mockResolvedValue({});

      const result = await service.remove('rec-1', 'u-1');
      expect(result.message).toMatch(/deleted/i);
      expect(mockAudit.log).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when record not found', async () => {
      mockPrisma.medicalRecord.findUnique.mockResolvedValue(null);
      await expect(service.remove('bad-id', 'u-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findMine ───────────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('throws NotFoundException when no patient profile exists', async () => {
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.findMine(pagination, 'u-1')).rejects.toThrow(NotFoundException);
    });
  });
});
