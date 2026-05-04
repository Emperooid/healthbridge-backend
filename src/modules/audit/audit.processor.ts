import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';

export const AUDIT_QUEUE = 'audit';
export const AUDIT_LOG_JOB = 'audit-log';

@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<CreateAuditLogDto>) {
    if (job.name !== AUDIT_LOG_JOB) return;

    try {
      const { userId, action, resource, resourceId, details, ipAddress, userAgent } = job.data;
      await this.prisma.auditLog.create({
        data: { userId, action, resource, resourceId, details: details as Prisma.InputJsonValue, ipAddress, userAgent },
      });
    } catch (err) {
      this.logger.error(`Failed to persist audit log job ${job.id}`, err);
      throw err;
    }
  }
}
