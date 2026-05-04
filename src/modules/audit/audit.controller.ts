import { Controller, Get, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Pagination, PaginationParams } from '../../common/decorators/pagination.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Get all audit logs (Admin)' })
  findAll(@Pagination() pagination: PaginationParams) {
    return this.auditService.findAll(pagination);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get audit logs for a specific user (Admin)' })
  findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Pagination() pagination: PaginationParams,
  ) {
    return this.auditService.findByUser(userId, pagination);
  }
}
