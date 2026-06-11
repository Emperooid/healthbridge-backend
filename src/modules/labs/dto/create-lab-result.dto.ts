import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isAbnormal?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'S3 key or URL of uploaded report file' })
  @IsOptional()
  @IsString()
  reportFile?: string;
}
