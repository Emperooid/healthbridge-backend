import { IsString, IsInt, IsOptional, Min, Max, IsIn } from 'class-validator';
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

  @ApiProperty({ description: 'Expiry in hours', example: 48, minimum: 1, maximum: 720 })
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours: number;

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
