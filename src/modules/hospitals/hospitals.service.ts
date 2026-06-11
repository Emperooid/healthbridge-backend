import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { AssignDoctorDto } from './dto/assign-doctor.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Role } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';

@Injectable()
export class HospitalsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateHospitalDto) {
    if (dto.email) {
      const existing = await this.prisma.hospital.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Hospital email already registered');
    }
    return this.prisma.hospital.create({ data: dto });
  }

  async findAll(pagination: PaginationParams) {
    const [data, total] = await Promise.all([
      this.prisma.hospital.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: { _count: { select: { doctors: true, patients: true } } },
      }),
      this.prisma.hospital.count({ where: { isActive: true } }),
    ]);
    return { data, meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) } };
  }

  async findOne(id: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id },
      include: {
        doctors: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        _count: { select: { patients: true, records: true } },
      },
    });
    if (!hospital) throw new NotFoundException(`Hospital ${id} not found`);
    return hospital;
  }

  async update(id: string, dto: UpdateHospitalDto) {
    await this.findOne(id);
    return this.prisma.hospital.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.hospital.delete({ where: { id } });
    return { message: `Hospital ${id} deleted` };
  }

  async assignDoctor(hospitalId: string, dto: AssignDoctorDto) {
    const [hospital, user] = await Promise.all([
      this.prisma.hospital.findUnique({ where: { id: hospitalId } }),
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
    ]);

    if (!hospital) throw new NotFoundException('Hospital not found');
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.DOCTOR) throw new BadRequestException('User must have DOCTOR role');

    const existingDoctor = await this.prisma.doctor.findUnique({ where: { userId: dto.userId } });
    if (existingDoctor) throw new ConflictException('Doctor already assigned to a hospital');

    const licenseExists = await this.prisma.doctor.findUnique({ where: { licenseNumber: dto.licenseNumber } });
    if (licenseExists) throw new ConflictException('License number already in use');

    return this.prisma.doctor.create({
      data: {
        userId: dto.userId,
        hospitalId,
        specialization: dto.specialization,
        licenseNumber: dto.licenseNumber,
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } }, hospital: true },
    });
  }

  async getDoctors(hospitalId: string, pagination: PaginationParams) {
    await this.findOne(hospitalId);
    const [data, total] = await Promise.all([
      this.prisma.doctor.findMany({
        where: { hospitalId },
        skip: pagination.skip,
        take: pagination.limit,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.doctor.count({ where: { hospitalId } }),
    ]);
    return { data, meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) } };
  }

  async createDepartment(hospitalId: string, dto: CreateDepartmentDto) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');

    return this.prisma.department.create({
      data: { hospitalId, name: dto.name, description: dto.description },
    });
  }

  async getDepartments(hospitalId: string) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');

    return this.prisma.department.findMany({
      where: { hospitalId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateDepartment(departmentId: string, dto: UpdateDepartmentDto) {
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    return this.prisma.department.update({
      where: { id: departmentId },
      data: dto,
    });
  }

  async removeDepartment(departmentId: string) {
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    await this.prisma.department.update({
      where: { id: departmentId },
      data: { isActive: false },
    });
    return { message: 'Department deactivated' };
  }
}
