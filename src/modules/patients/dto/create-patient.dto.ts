import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export class CreatePatientDto {
  @ApiProperty({ description: 'User ID to link this patient profile to' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Hospital ID the patient belongs to' })
  @IsUUID()
  hospitalId: string;

  @ApiPropertyOptional({ example: '1990-06-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: string;

  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  bloodType?: string;

  @ApiPropertyOptional({ example: ['Penicillin', 'Aspirin'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ example: 'Jane Doe: +2348098765432' })
  @IsOptional()
  @IsString()
  emergencyContact?: string;
}
