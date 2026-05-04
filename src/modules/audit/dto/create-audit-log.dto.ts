import { AuditAction } from '@prisma/client';

export class CreateAuditLogDto {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
