import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsDateString } from 'class-validator';

export class CreateVisitDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  doctorId: string;

  @ApiProperty()
  @IsUUID()
  hospitalId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ example: 'Chest pain and shortness of breath' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ example: '2026-06-09T09:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startTime?: string;
}
