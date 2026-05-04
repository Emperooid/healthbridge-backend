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
import { RecordsService } from './records.service';
import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Pagination, PaginationParams } from '../../common/decorators/pagination.decorator';

@ApiTags('records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a medical record' })
  create(
    @Body() dto: CreateRecordDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.recordsService.create(dto, requesterId);
  }

  @Get()
  @ApiOperation({ summary: 'List records (filtered by role)' })
  findAll(
    @Pagination() pagination: PaginationParams,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.recordsService.findAll(pagination, requesterId, requesterRole);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get all records for a patient' })
  findByPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Pagination() pagination: PaginationParams,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.recordsService.findByPatient(patientId, pagination, requesterId, requesterRole);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single record' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.recordsService.findOne(id, requesterId, requesterRole);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a record' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecordDto,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.recordsService.update(id, dto, requesterId, requesterRole);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a record (Admin/Doctor)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.recordsService.remove(id, requesterId);
  }
}
