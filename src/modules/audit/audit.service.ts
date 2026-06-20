import { Injectable, Logger } from '@nestjs/common';
import { paginate } from '../../common/utils/paginate';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { AUDIT_QUEUE, AUDIT_LOG_JOB } from './audit.processor';
import { PaginationParams } from '../../common/decorators/pagination.decorator';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(AUDIT_QUEUE) private auditQueue: Queue,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      await this.auditQueue.add(AUDIT_LOG_JOB, dto, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    } catch (err) {
      this.logger.warn(`Queue unavailable, persisting audit log synchronously: ${err.message}`);
      const { userId, action, resource, resourceId, details, ipAddress, userAgent } = dto;
      await this.prisma.auditLog
        .create({ data: { userId, action, resource, resourceId, details: details as Prisma.InputJsonValue, ipAddress, userAgent } })
        .catch((e) => { this.logger.error('Failed to persist audit log synchronously', e); });
    }
  }

  async findAll(
    pagination: PaginationParams,
    filters: { userId?: string; action?: string; resourceType?: string; startDate?: string; endDate?: string } = {},
  ) {
    const { userId, action, resourceType, startDate, endDate } = filters;

    const where: any = {
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(resourceType ? { resource: resourceType } : {}),
      ...((startDate || endDate) ? {
        createdAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate ? { lte: new Date(endDate) } : {}),
        },
      } : {}),
    };

    const [raw, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data = raw.map((log) => ({
      id: log.id,
      userId: log.userId,
      userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
      userRole: log.user?.role ?? null,
      action: log.action,
      resourceType: log.resource,
      resourceId: log.resourceId,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: log.createdAt,
      details: log.details,
    }));

    return paginate(data, total, pagination);
  }

  async findByUser(userId: string) {
    const raw = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { firstName: true, lastName: true, role: true } } },
    });

    return raw.map((log) => ({
      id: log.id,
      userId: log.userId,
      userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
      userRole: log.user?.role ?? null,
      action: log.action,
      resourceType: log.resource,
      resourceId: log.resourceId,
      ipAddress: log.ipAddress,
      timestamp: log.createdAt,
      details: log.details,
    }));
  }
}
