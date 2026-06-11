import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { VisitStatus } from '@prisma/client';

export class UpdateVisitDto {
  @ApiPropertyOptional({ enum: VisitStatus })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiPropertyOptional({ example: '2026-06-09T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endTime?: string;
}
