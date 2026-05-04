import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { HospitalsService } from './hospitals.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { AssignDoctorDto } from './dto/assign-doctor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Pagination, PaginationParams } from '../../common/decorators/pagination.decorator';

@ApiTags('hospitals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a hospital (Admin)' })
  create(@Body() dto: CreateHospitalDto) {
    return this.hospitalsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all active hospitals' })
  findAll(@Pagination() pagination: PaginationParams) {
    return this.hospitalsService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get hospital details' })
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
  @ApiOperation({ summary: 'Assign a doctor to this hospital (Admin)' })
  assignDoctor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDoctorDto) {
    return this.hospitalsService.assignDoctor(id, dto);
  }

  @Get(':id/doctors')
  @Roles(Role.ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'List doctors in a hospital' })
  getDoctors(@Param('id', ParseUUIDPipe) id: string, @Pagination() pagination: PaginationParams) {
    return this.hospitalsService.getDoctors(id, pagination);
  }
}
