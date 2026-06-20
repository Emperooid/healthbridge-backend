import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { paginate } from '../../common/utils/paginate';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { RegisterHospitalDto } from './dto/register-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { AssignDoctorDto } from './dto/assign-doctor.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { Role } from '@prisma/client';
import { PaginationParams } from '../../common/decorators/pagination.decorator';

const SALT_ROUNDS = 12;

@Injectable()
export class HospitalsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterHospitalDto) {
    const [emailUser, licenseConflict] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.hospital.findUnique({ where: { licenseNumber: dto.licenseNumber } }),
    ]);
    if (emailUser) throw new ConflictException('Email already registered');
    if (licenseConflict) throw new ConflictException('License number already in use');

    const hashedPassword = await bcrypt.hash(dto.adminPassword, SALT_ROUNDS);

    const hospital = await this.prisma.hospital.create({
      data: {
        name: dto.name,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        phone: dto.phone,
        type: dto.hospitalType,
        licenseNumber: dto.licenseNumber,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.adminFirstName,
        lastName: dto.adminLastName,
        email: dto.email,
        password: hashedPassword,
        phone: dto.adminPhone,
        role: Role.ADMIN,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.emailVerificationToken.create({
      data: { userId: user.id, token: hashedToken, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.mail.sendEmailVerification(user.email, user.firstName, `${frontendUrl}/verify-email?token=${rawToken}`)
      .catch(() => undefined);

    const tokens = await this.issueTokenPair(user.id, user.email, user.role);
    return {
      ...tokens,
      user: { ...user, hospitalId: hospital.id },
      hospital: { id: hospital.id, name: hospital.name },
    };
  }

  private async issueTokenPair(userId: string, email: string, role: Role) {
    const payload = { sub: userId, email, role };
    const accessSecret = this.configService.get<string>('jwt.accessSecret');
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { secret: accessSecret, expiresIn: '15m' }),
      this.jwtService.signAsync(payload, { secret: refreshSecret, expiresIn: '7d' }),
    ]);

    const hashed = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await this.prisma.refreshToken.create({
      data: { userId, token: hashed, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });

    return { accessToken, refreshToken };
  }

  async findPublic() {
    return this.prisma.hospital.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, phone: true, email: true },
    });
  }

  async create(dto: CreateHospitalDto) {
    if (dto.email) {
      const existing = await this.prisma.hospital.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Hospital email already registered');
    }
    return this.prisma.hospital.create({ data: dto });
  }

  async findAll(pagination: PaginationParams, filters: { search?: string; isActive?: boolean } = {}) {
    const { search, isActive } = filters;
    const where: any = {
      ...(isActive !== undefined ? { isActive } : { isActive: true }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.hospital.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        where,
        orderBy: { name: 'asc' },
        include: { _count: { select: { doctors: true, patients: true } } },
      }),
      this.prisma.hospital.count({ where }),
    ]);
    return paginate(data, total, pagination);
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

  async getDoctors(hospitalId: string) {
    await this.findOne(hospitalId);
    const doctors = await this.prisma.doctor.findMany({
      where: { hospitalId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { assignedPatients: true } },
      },
    });

    return doctors.map((d) => ({
      id: d.id,
      userId: d.userId,
      name: `${d.user.firstName} ${d.user.lastName}`,
      email: d.user.email,
      specialization: d.specialization,
      licenseNumber: d.licenseNumber,
      patientCount: d._count.assignedPatients,
      joinedAt: d.createdAt,
    }));
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

  async updateDoctor(hospitalId: string, doctorId: string, dto: UpdateDoctorDto) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (doctor.hospitalId !== hospitalId) throw new BadRequestException('Doctor does not belong to this hospital');

    if (dto.licenseNumber && dto.licenseNumber !== doctor.licenseNumber) {
      const conflict = await this.prisma.doctor.findUnique({ where: { licenseNumber: dto.licenseNumber } });
      if (conflict) throw new ConflictException('License number already in use');
    }

    return this.prisma.doctor.update({
      where: { id: doctorId },
      data: dto,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
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


