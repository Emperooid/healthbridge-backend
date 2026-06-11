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
import { Role, VisitStatus } from '@prisma/client';
import { EncountersService } from './encounters.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { UpdateEncounterDto } from './dto/update-encounter.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Pagination, PaginationParams } from '../../common/decorators/pagination.decorator';

@ApiTags('encounters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('encounters')
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  // ─── Visits ──────────────────────────────────────────────────────────────

  @Post('visits')
  @ApiOperation({ summary: 'Start a new visit (Doctor, Admin)' })
  createVisit(
    @Body() dto: CreateVisitDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.encountersService.createVisit(dto, requesterId);
  }

  @Get('visits')
  @ApiOperation({ summary: 'List visits' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'doctorId', required: false })
  @ApiQuery({ name: 'status', enum: VisitStatus, required: false })
  findAllVisits(
    @Pagination() pagination: PaginationParams,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
    @Query('patientId') patientId?: string,
    @Query('doctorId') doctorId?: string,
    @Query('status') status?: VisitStatus,
  ) {
    return this.encountersService.findAllVisits(pagination, requesterId, requesterRole, { patientId, doctorId, status });
  }

  @Get('visits/:id')
  @ApiOperation({ summary: 'Get a visit with its encounters' })
  findOneVisit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.encountersService.findOneVisit(id, requesterId, requesterRole);
  }

  @Patch('visits/:id')
  @ApiOperation({ summary: 'Update visit status or end time (Doctor, Admin)' })
  updateVisit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitDto,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.encountersService.updateVisit(id, dto, requesterId, requesterRole);
  }

  // ─── Encounters ───────────────────────────────────────────────────────────

  @Post('notes')
  @ApiOperation({ summary: 'Add an encounter note to a visit (Doctor, Admin)' })
  createEncounter(
    @Body() dto: CreateEncounterDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.encountersService.createEncounter(dto, requesterId);
  }

  @Get('visits/:visitId/notes')
  @ApiOperation({ summary: 'Get all encounters for a visit' })
  findEncountersByVisit(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.encountersService.findEncountersByVisit(visitId, requesterId, requesterRole);
  }

  @Patch('notes/:id')
  @ApiOperation({ summary: 'Update an encounter note (Doctor, Admin)' })
  updateEncounter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEncounterDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.encountersService.updateEncounter(id, dto, requesterId);
  }
}
