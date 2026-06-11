import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID, IsOptional, ArrayMinSize } from 'class-validator';

export class CreateLabOrderDto {
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
