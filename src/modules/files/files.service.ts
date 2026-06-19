import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, Role } from '@prisma/client';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {
    this.s3 = new S3Client({
      region: this.configService.get<string>('aws.region'),
      credentials: {
        accessKeyId: this.configService.get<string>('aws.accessKeyId')!,
        secretAccessKey: this.configService.get<string>('aws.secretAccessKey')!,
      },
    });
    this.bucket = this.configService.get<string>('aws.s3Bucket')!;
  }

  async upload(
    file: any,
    recordId: string,
    uploaderId: string,
  ) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('File type not allowed');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds 10MB limit');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Medical record not found');

    const ext = file.originalname.split('.').pop();
    const s3Key = `records/${recordId}/${uuidv4()}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ServerSideEncryption: 'AES256',
        Metadata: {
          uploadedBy: uploaderId,
          recordId,
          originalName: file.originalname,
        },
      }),
    );

    const fileRecord = await this.prisma.fileUpload.create({
      data: {
        recordId,
        fileName: s3Key.split('/').pop()!,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        s3Key,
        s3Bucket: this.bucket,
        uploadedById: uploaderId,
      },
    });

    await this.auditService.log({
      userId: uploaderId,
      action: AuditAction.FILE_UPLOAD,
      resource: 'FileUpload',
      resourceId: fileRecord.id,
      details: { recordId, originalName: file.originalname, size: file.size },
    });

    return fileRecord;
  }

  async getSignedUrl(fileId: string, requesterId: string, requesterRole: Role): Promise<{ url: string }> {
    const file = await this.prisma.fileUpload.findUnique({
      where: { id: fileId },
      include: { record: { include: { patient: { include: { user: true } }, doctor: true } } },
    });
    if (!file) throw new NotFoundException('File not found');

    this.assertFileAccess(file.record, requesterId, requesterRole);

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: file.s3Key });
    const url = await getSignedUrl(this.s3, command, { expiresIn: 3600 });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.FILE_ACCESS,
      resource: 'FileUpload',
      resourceId: fileId,
    });

    return { url };
  }

  async findByRecord(recordId: string) {
    return this.prisma.fileUpload.findMany({
      where: { recordId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(fileId: string, requesterId: string) {
    const file = await this.prisma.fileUpload.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: file.s3Key }));
    await this.prisma.fileUpload.delete({ where: { id: fileId } });

    await this.auditService.log({
      userId: requesterId,
      action: AuditAction.DELETE,
      resource: 'FileUpload',
      resourceId: fileId,
    });

    return { message: 'File deleted' };
  }

  private assertFileAccess(
    record: { patient: { user: { id: string } }; doctor: { userId: string } },
    requesterId: string,
    role: Role,
  ) {
    if (role === Role.ADMIN) return;
    if (role === Role.DOCTOR && record.doctor.userId !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
    if (role === Role.PATIENT && record.patient.user.id !== requesterId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
