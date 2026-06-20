import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID, IsOptional, ArrayMinSize } from 'class-validator';

export class CreateLabOrderDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional({ description: 'Auto-resolved from JWT token if omitted' })
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiPropertyOptional({ description: 'Auto-resolved from doctor profile if omitted' })
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  visitId?: string;

  @ApiProperty({ example: ['Full Blood Count', 'Liver Function Test'], type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  tests: string[];

  @ApiPropertyOptional({ example: 'Fasting required for 8 hours before sample collection' })
  @IsOptional()
  @IsString()
  notes?: string;
}
