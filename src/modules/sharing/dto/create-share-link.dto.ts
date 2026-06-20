import { IsString, IsInt, IsOptional, IsDateString, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShareLinkDto {
  @ApiProperty({
    description: 'Scope of shared data',
    enum: ['ALL', 'RECORDS', 'LABS', 'PRESCRIPTIONS'],
    example: 'ALL',
  })
  @IsString()
  @IsIn(['ALL', 'RECORDS', 'LABS', 'PRESCRIPTIONS'])
  scope: string;

  @ApiPropertyOptional({ description: 'ISO date string expiry', example: '2026-07-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Max number of times the link can be accessed', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAccess?: number;
}

export class CreateShareGrantDto {
  @ApiProperty({ example: 'doctor@hospital.com' })
  @IsString()
  grantedToEmail: string;

  @ApiProperty({ enum: ['ALL', 'RECORDS', 'LABS', 'PRESCRIPTIONS'], default: 'ALL' })
  @IsString()
  @IsIn(['ALL', 'RECORDS', 'LABS', 'PRESCRIPTIONS'])
  scope: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;
}
