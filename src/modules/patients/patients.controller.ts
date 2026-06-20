import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { AssignDoctorDto } from './dto/assign-doctor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Pagination, PaginationParams } from '../../common/decorators/pagination.decorator';

@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @ApiOperation({ summary: 'Create patient profile' })
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List patients (filtered by role)' })
  findAll(
    @Pagination() pagination: PaginationParams,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
    @Query('search') search?: string,
    @Query('hospitalId') hospitalId?: string,
    @Query('doctorId') doctorId?: string,
  ) {
    return this.patientsService.findAll(pagination, requesterId, requesterRole, { search, hospitalId, doctorId });
  }

  @Get('me')
  @ApiOperation({ summary: 'Get own patient profile (by JWT)' })
  findMe(@CurrentUser('id') requesterId: string) {
    return this.patientsService.findMe(requesterId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.patientsService.findOne(id, requesterId, requesterRole);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update patient profile' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.patientsService.update(id, dto, requesterId, requesterRole);
  }

  @Patch(':id/assign-doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign a doctor to a patient (Admin/Doctor)' })
  assignDoctor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDoctorDto,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.patientsService.assignDoctor(id, dto, requesterId, requesterRole);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete patient (Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientsService.remove(id);
  }
}
