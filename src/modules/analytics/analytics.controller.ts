import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'System-wide overview stats (Admin)' })
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('patients')
  @ApiOperation({ summary: 'Patient registration statistics (Admin)' })
  getPatientStats() {
    return this.analyticsService.getPatientStats();
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Appointment statistics (Admin)' })
  getAppointmentStats() {
    return this.analyticsService.getAppointmentStats();
  }

  @Get('records')
  @ApiOperation({ summary: 'Medical record statistics (Admin)' })
  getRecordStats() {
    return this.analyticsService.getRecordStats();
  }

  @Get('hospitals')
  @ApiOperation({ summary: 'Per-hospital utilization statistics (Admin)' })
  getHospitalStats() {
    return this.analyticsService.getHospitalStats();
  }

  @Get('labs')
  @ApiOperation({ summary: 'Lab order and result statistics (Admin)' })
  getLabStats() {
    return this.analyticsService.getLabStats();
  }

  @Get('prescriptions')
  @ApiOperation({ summary: 'Prescription statistics (Admin)' })
  getPrescriptionStats() {
    return this.analyticsService.getPrescriptionStats();
  }
}
