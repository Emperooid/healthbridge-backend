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
import { LabOrderStatus, Role } from '@prisma/client';
import { LabsService } from './labs.service';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { UpdateLabOrderDto } from './dto/update-lab-order.dto';
import { CreateLabResultDto } from './dto/create-lab-result.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Pagination, PaginationParams } from '../../common/decorators/pagination.decorator';

@ApiTags('labs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('labs')
export class LabsController {
  constructor(private readonly labsService: LabsService) {}

  // ─── Lab Orders ───────────────────────────────────────────────────────────

  @Post('orders')
  @ApiOperation({ summary: 'Create a lab order (Doctor, Admin)' })
  createOrder(
    @Body() dto: CreateLabOrderDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.labsService.createOrder(dto, requesterId);
  }

  @Get('orders')
  @ApiOperation({ summary: 'List lab orders (filtered by role)' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'status', enum: LabOrderStatus, required: false })
  findAllOrders(
    @Pagination() pagination: PaginationParams,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
    @Query('patientId') patientId?: string,
    @Query('status') status?: LabOrderStatus,
  ) {
    return this.labsService.findAllOrders(pagination, requesterId, requesterRole, { patientId, status });
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get a lab order with its results' })
  findOneOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.labsService.findOneOrder(id, requesterId, requesterRole);
  }

  @Patch('orders/:id')
  @ApiOperation({ summary: 'Update lab order status (Admin)' })
  updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabOrderDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.labsService.updateOrder(id, dto, requesterId);
  }

  // ─── Lab Results ──────────────────────────────────────────────────────────

  @Post('results')
  @ApiOperation({ summary: 'Post a lab result for an order (Admin, lab staff via Admin role)' })
  addResult(
    @Body() dto: CreateLabResultDto,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.labsService.addResult(dto, requesterId);
  }

  @Get('orders/:orderId/results')
  @ApiOperation({ summary: 'Get all results for a lab order' })
  findResultsByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') requesterRole: Role,
  ) {
    return this.labsService.findResultsByOrder(orderId, requesterId, requesterRole);
  }
}
