import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional } from 'class-validator';

export class CreatePrescriptionDto {
  @ApiProperty()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsUUID()
  doctorId: string;

  @ApiProperty()
  @IsUUID()
  hospitalId: string;

  @ApiPropertyOptional({ description: 'Link to a specific visit' })
  @IsOptional()
  @IsUUID()
  visitId?: string;

  @ApiProperty({ example: 'Amoxicillin' })
  @IsString()
  drug: string;

  @ApiProperty({ example: '500mg' })
  @IsString()
  dosage: string;

  @ApiProperty({ example: 'Twice daily' })
  @IsString()
  frequency: string;

  @ApiProperty({ example: '7 days' })
  @IsString()
  duration: string;

  @ApiPropertyOptional({ example: 'Take after meals' })
  @IsOptional()
  @IsString()
  instructions?: string;
}
