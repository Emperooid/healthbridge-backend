import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Delete,
  Res,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { HospitalsService } from './hospitals.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { RegisterHospitalDto } from './dto/register-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { AssignDoctorDto } from './dto/assign-doctor.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Pagination, PaginationParams } from '../../common/decorators/pagination.decorator';
import { setAuthCookies } from '../../common/utils/set-auth-cookies';

@ApiTags('hospitals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospitals')
export class HospitalsController {
  constructor(
    private readonly hospitalsService: HospitalsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Hospital self-registration (public)' })
  async register(@Body() dto: RegisterHospitalDto, @Res({ passthrough: true }) res: any) {
    const result = await this.hospitalsService.register(dto);
    setAuthCookies(res, result.refreshToken, result.user, this.jwtService, this.configService);
    const { refreshToken: _, ...body } = result;
    return body;
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Public hospital list for registration forms' })
  findPublic() {
    return this.hospitalsService.findPublic();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a hospital (Admin)' })
  create(@Body() dto: CreateHospitalDto) {
    return this.hospitalsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all hospitals' })
  findAll(
    @Pagination() pagination: PaginationParams,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBool = isActive === undefined ? undefined : isActive !== 'false';
    return this.hospitalsService.findAll(pagination, { search, isActive: isActiveBool });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get hospital by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.hospitalsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update hospital (Admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHospitalDto) {
    return this.hospitalsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete hospital (Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.hospitalsService.remove(id);
  }

  @Post(':id/doctors')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign a doctor to a hospital (Admin)' })
  assignDoctor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDoctorDto) {
    return this.hospitalsService.assignDoctor(id, dto);
  }

  @Patch(':hospitalId/doctors/:doctorId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update doctor profile within a hospital (Admin)' })
  updateDoctor(
    @Param('hospitalId', ParseUUIDPipe) hospitalId: string,
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Body() dto: UpdateDoctorDto,
  ) {
    return this.hospitalsService.updateDoctor(hospitalId, doctorId, dto);
  }

  @Get(':id/doctors')
  @ApiOperation({ summary: 'List doctors in a hospital (unpaginated dropdown)' })
  getDoctors(@Param('id', ParseUUIDPipe) id: string) {
    return this.hospitalsService.getDoctors(id);
  }

  // ─── Departments ──────────────────────────────────────────────────────────

  @Post(':id/departments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a department within a hospital (Admin)' })
  createDepartment(
    @Param('id', ParseUUIDPipe) hospitalId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.hospitalsService.createDepartment(hospitalId, dto);
  }

  @Get(':id/departments')
  @ApiOperation({ summary: 'List departments for a hospital' })
  getDepartments(@Param('id', ParseUUIDPipe) hospitalId: string) {
    return this.hospitalsService.getDepartments(hospitalId);
  }

  @Patch('departments/:departmentId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a department (Admin)' })
  updateDepartment(
    @Param('departmentId', ParseUUIDPipe) departmentId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.hospitalsService.updateDepartment(departmentId, dto);
  }

  @Delete('departments/:departmentId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a department (Admin)' })
  removeDepartment(@Param('departmentId', ParseUUIDPipe) departmentId: string) {
    return this.hospitalsService.removeDepartment(departmentId);
  }
}
