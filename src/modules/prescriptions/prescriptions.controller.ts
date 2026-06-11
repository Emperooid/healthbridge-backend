import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PrescriptionStatus, Role } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Pagination, PaginationParams } from '../../common/decorators/pagination.decorator';

@ApiTags('prescriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  @ApiOperation({ summary: 'Issue a prescription (Doctor, Admin)' })
  create(
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.prescriptionsService.create(dto, requesterId);
  }

  @Get()
  @ApiOperation({ summary: 'List prescriptions (filtered by role)' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'doctorId', required: false })
  @ApiQuery({ name: 'status', enum: PrescriptionStatus, required: false })
  findAll(
    @Pagination() pagination: PaginationParams,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
    @Query('patientId') patientId?: string,
    @Query('doctorId') doctorId?: string,
    @Query('status') status?: PrescriptionStatus,
  ) {
    return this.prescriptionsService.findAll(pagination, requesterId, requesterRole, { patientId, doctorId, status });
  }

  @Get('mine')
  @ApiOperation({ summary: 'Get my prescriptions (patient or doctor view)' })
  findMine(
    @Pagination() pagination: PaginationParams,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.prescriptionsService.findMine(pagination, requesterId, requesterRole);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get prescription by ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.prescriptionsService.findOne(id, requesterId, requesterRole);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update prescription status or details (Doctor, Admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrescriptionDto,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.prescriptionsService.update(id, dto, requesterId, requesterRole);
  }
}
