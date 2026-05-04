import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignDoctorDto {
  @ApiProperty({ description: 'User ID of the doctor to assign' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ example: 'Cardiology' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiProperty({ example: 'LMC-2024-001' })
  @IsString()
  licenseNumber: string;
}
