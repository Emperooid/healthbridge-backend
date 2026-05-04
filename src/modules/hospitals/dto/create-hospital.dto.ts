import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateHospitalDto {
  @ApiProperty({ example: 'Lagos General Hospital' })
  @IsString()
  name: string;

  @ApiProperty({ example: '1 Hospital Road, Lagos' })
  @IsString()
  address: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'info@lgh.ng' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
