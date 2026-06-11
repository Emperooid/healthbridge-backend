import { IsString, IsUUID, IsDateString, IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentType } from '@prisma/client';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  doctorId: string;

  @ApiProperty()
  @IsUUID()
  hospitalId: string;

  @ApiProperty({ example: 'General Checkup' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Routine annual checkup' })
  @IsString()
  reason: string;

  @ApiProperty({ enum: AppointmentType, default: AppointmentType.CONSULTATION })
  @IsEnum(AppointmentType)
  type: AppointmentType;

  @ApiProperty({ example: '2026-05-10T10:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ example: 30, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
