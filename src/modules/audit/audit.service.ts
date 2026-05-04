import { Injectable, Logger } from '@nestjs/common';
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
      await this.prisma.auditLog.create({ data: { userId, action, resource, resourceId, details: details as Prisma.InputJsonValue, ipAddress, userAgent } }).catch((e) => {
        this.logger.error('Failed to persist audit log synchronously', e);
      });
    }
  }

  async findAll(pagination: PaginationParams) {
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.auditLog.count(),
    ]);
    return {
      data,
      meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) },
    };
  }

  async findByUser(userId: string, pagination: PaginationParams) {
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where: { userId } }),
    ]);
    return {
      data,
      meta: { total, page: pagination.page, limit: pagination.limit, pages: Math.ceil(total / pagination.limit) },
    };
  }
}
