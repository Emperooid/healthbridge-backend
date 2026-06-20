import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum LabInterpretation {
  NORMAL = 'NORMAL',
  ABNORMAL = 'ABNORMAL',
  CRITICAL = 'CRITICAL',
}

export class CreateLabResultDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;

  @ApiProperty({ example: 'Haemoglobin' })
  @IsString()
  testName: string;

  @ApiPropertyOptional({ example: '14.5' })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiPropertyOptional({ example: 'g/dL' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: '13.5 - 17.5 g/dL' })
  @IsOptional()
  @IsString()
  referenceRange?: string;

  @ApiPropertyOptional({ default: false, description: 'Legacy boolean flag — use interpretation instead' })
  @IsOptional()
  @IsBoolean()
  isAbnormal?: boolean;

  @ApiPropertyOptional({ enum: LabInterpretation, description: 'Preferred over isAbnormal' })
  @IsOptional()
  @IsEnum(LabInterpretation)
  interpretation?: LabInterpretation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'S3 key or URL of uploaded report file' })
  @IsOptional()
  @IsString()
  reportFile?: string;

  @ApiPropertyOptional({ description: 'Alias for reportFile' })
  @IsOptional()
  @IsString()
  fileUrl?: string;
}
