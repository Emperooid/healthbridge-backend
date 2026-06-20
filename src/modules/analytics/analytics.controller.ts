import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Patient registrations time series (Admin)' })
  getPatientStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getPatientTimeSeries(from, to);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Appointments time series (Admin)' })
  getAppointmentStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getAppointmentTimeSeries(from, to);
  }

  @Get('records')
  @ApiOperation({ summary: 'Medical records time series (Admin)' })
  getRecordStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getRecordTimeSeries(from, to);
  }

  @Get('labs')
  @ApiOperation({ summary: 'Lab orders time series (Admin)' })
  getLabStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getLabTimeSeries(from, to);
  }

  @Get('prescriptions')
  @ApiOperation({ summary: 'Prescriptions time series (Admin)' })
  getPrescriptionStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getPrescriptionTimeSeries(from, to);
  }

  @Get('hospitals')
  @ApiOperation({ summary: 'Per-hospital patient count (Admin)' })
  getHospitalStats() {
    return this.analyticsService.getHospitalBreakdown();
  }
}
