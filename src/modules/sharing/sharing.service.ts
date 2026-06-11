import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  GoneException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { ShareLinkStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class SharingService {
  constructor(private prisma: PrismaService) {}

  // ─── Share Links ───────────────────────────────────────────────────────────

  async createLink(requesterId: string, dto: CreateShareLinkDto) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
    if (!patient) throw new NotFoundException('Patient profile not found');

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + dto.expiresInHours);

    return this.prisma.shareLink.create({
      data: {
        patientId: patient.id,
        token,
        scope: dto.scope,
        expiresAt,
        maxAccess: dto.maxAccess,
      },
    });
  }

  async getMyLinks(requesterId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
    if (!patient) throw new NotFoundException('Patient profile not found');

    return this.prisma.shareLink.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeLink(id: string, requesterId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
    if (!patient) throw new NotFoundException('Patient profile not found');

    const link = await this.prisma.shareLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Share link not found');
    if (link.patientId !== patient.id) throw new ForbiddenException('Access denied');

    return this.prisma.shareLink.update({
      where: { id },
      data: { status: ShareLinkStatus.REVOKED },
    });
  }

  async resolveToken(token: string) {
    const link = await this.prisma.shareLink.findUnique({
      where: { token },
      include: {
        patient: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
            hospital: { select: { name: true } },
          },
        },
      },
    });

    if (!link) throw new NotFoundException('Share link not found');
    if (link.status === ShareLinkStatus.REVOKED) throw new GoneException('This share link has been revoked');
    if (link.status === ShareLinkStatus.EXPIRED || new Date() > link.expiresAt) {
      await this.prisma.shareLink.update({ where: { id: link.id }, data: { status: ShareLinkStatus.EXPIRED } });
      throw new GoneException('This share link has expired');
    }
    if (link.maxAccess && link.accessCount >= link.maxAccess) {
      throw new GoneException('This share link has reached its maximum access count');
    }

    await this.prisma.shareLink.update({ where: { id: link.id }, data: { accessCount: { increment: 1 } } });

    const scope = link.scope;
    const patientId = link.patientId;

    const [records, files] = await Promise.all([
      (scope === 'ALL' || scope === 'RECORDS' || scope === 'PRESCRIPTIONS')
        ? this.prisma.medicalRecord.findMany({
            where: { patientId },
            orderBy: { visitDate: 'desc' },
            select: {
              id: true, title: true, diagnosis: true, treatment: true,
              prescription: true, visitDate: true, status: true,
            },
          })
        : [],
      (scope === 'ALL' || scope === 'LABS')
        ? this.prisma.fileUpload.findMany({
            where: { record: { patientId } },
            select: { id: true, originalName: true, mimeType: true, createdAt: true },
          })
        : [],
    ]);

    return { patient: link.patient, scope, expiresAt: link.expiresAt, records, files };
  }

  // ─── Share Grants ──────────────────────────────────────────────────────────

  async createGrant(requesterId: string, dto: { grantedToEmail: string; scope: string; expiresInDays?: number }) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
    if (!patient) throw new NotFoundException('Patient profile not found');

    const grantee = await this.prisma.user.findUnique({ where: { email: dto.grantedToEmail } });
    if (!grantee) throw new NotFoundException('User not found with that email');

    const existing = await this.prisma.shareGrant.findFirst({
      where: { patientId: patient.id, grantedToId: grantee.id, revokedAt: null },
    });
    if (existing) throw new BadRequestException('Access already granted to this user');

    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 86400000)
      : undefined;

    return this.prisma.shareGrant.create({
      data: {
        patientId: patient.id,
        grantedToId: grantee.id,
        scope: dto.scope ?? 'ALL',
        expiresAt,
      },
      include: {
        grantedTo: { select: { firstName: true, lastName: true, email: true, role: true } },
      },
    });
  }

  async getMyGrants(requesterId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
    if (!patient) throw new NotFoundException('Patient profile not found');

    return this.prisma.shareGrant.findMany({
      where: { patientId: patient.id },
      include: { grantedTo: { select: { firstName: true, lastName: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeGrant(id: string, requesterId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
    if (!patient) throw new NotFoundException('Patient profile not found');

    const grant = await this.prisma.shareGrant.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException('Grant not found');
    if (grant.patientId !== patient.id) throw new ForbiddenException('Access denied');

    return this.prisma.shareGrant.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async getShareLinkQr(id: string, requesterId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({ where: { userId: requesterId } });
    if (!patient) throw new NotFoundException('Patient profile not found');

    const link = await this.prisma.shareLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Share link not found');
    if (link.patientId !== patient.id) throw new ForbiddenException('Access denied');

    const baseUrl = process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:3000';
    const shareUrl = `${baseUrl}/api/v1/share/resolve/${link.token}`;
    const QRCode = await import('qrcode');
    return QRCode.toDataURL(shareUrl);
  }
}
