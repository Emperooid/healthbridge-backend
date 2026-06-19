import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { HospitalsService } from './hospitals.service';
import { PrismaService } from '../../database/prisma.service';
import { Role } from '@prisma/client';

const mockPrisma = {
  hospital: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  doctor: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  department: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
};

const pagination = { skip: 0, limit: 10, page: 1 };

describe('HospitalsService', () => {
  let service: HospitalsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [HospitalsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<HospitalsService>(HospitalsService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a hospital', async () => {
      mockPrisma.hospital.findUnique.mockResolvedValue(null);
      mockPrisma.hospital.create.mockResolvedValue({ id: 'h-1', name: 'General Hospital' });

      const result = await service.create({ name: 'General Hospital', address: '1 Main St' });
      expect(result.name).toBe('General Hospital');
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'h-1' });

      await expect(
        service.create({ name: 'Dupe', address: '1 Main St', email: 'taken@hospital.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns hospital when found', async () => {
      mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'h-1', name: 'General', doctors: [], _count: {} });
      const result = await service.findOne('h-1');
      expect(result.id).toBe('h-1');
    });

    it('throws NotFoundException when not found', async () => {
      mockPrisma.hospital.findUnique.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── assignDoctor ───────────────────────────────────────────────────────────

  describe('assignDoctor', () => {
    it('throws NotFoundException when hospital not found', async () => {
      mockPrisma.hospital.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: Role.DOCTOR });

      await expect(
        service.assignDoctor('bad-h', { userId: 'u-1', licenseNumber: 'LIC-01' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when user is not a DOCTOR', async () => {
      mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: Role.PATIENT });

      await expect(
        service.assignDoctor('h-1', { userId: 'u-1', licenseNumber: 'LIC-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when doctor already assigned', async () => {
      mockPrisma.hospital.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: Role.DOCTOR });
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd-1' }); // existing doctor

      await expect(
        service.assignDoctor('h-1', { userId: 'u-1', licenseNumber: 'LIC-01' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── updateDoctor ───────────────────────────────────────────────────────────

  describe('updateDoctor', () => {
    it('throws NotFoundException when doctor not found', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValue(null);
      await expect(service.updateDoctor('h-1', 'd-1', { specialization: 'Cardiology' })).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when doctor belongs to different hospital', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValue({ id: 'd-1', hospitalId: 'h-2', licenseNumber: 'LIC-01' });
      await expect(service.updateDoctor('h-1', 'd-1', { specialization: 'Cardiology' })).rejects.toThrow(BadRequestException);
    });

    it('updates doctor profile', async () => {
      mockPrisma.doctor.findUnique.mockResolvedValueOnce({ id: 'd-1', hospitalId: 'h-1', licenseNumber: 'LIC-01' });
      mockPrisma.doctor.update.mockResolvedValue({ id: 'd-1', specialization: 'Cardiology' });

      const result = await service.updateDoctor('h-1', 'd-1', { specialization: 'Cardiology' });
      expect(result.specialization).toBe('Cardiology');
    });
  });
});
