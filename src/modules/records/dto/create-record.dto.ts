import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { RecordStatus } from '@prisma/client';

export class CreateRecordDto {
  @ApiProperty({ description: 'Patient ID' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'Doctor ID' })
  @IsUUID()
  doctorId: string;

  @ApiProperty({ description: 'Hospital ID' })
  @IsUUID()
  hospitalId: string;

  @ApiProperty({ example: 'Annual Check-up' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Patient presented with...' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 'Hypertension Stage 1' })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({ example: 'Lifestyle modifications and monitoring' })
  @IsOptional()
  @IsString()
  treatment?: string;

  @ApiPropertyOptional({ example: 'Amlodipine 5mg daily' })
  @IsOptional()
  @IsString()
  prescription?: string;

  @ApiPropertyOptional({ enum: RecordStatus, default: RecordStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @ApiPropertyOptional({ example: '2026-04-15T09:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  visitDate?: string;
}
