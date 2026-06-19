import { IsEmail, IsString, IsOptional, MinLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HospitalType } from '@prisma/client';

export class RegisterHospitalDto {
  @ApiProperty() @IsString() hospitalName!: string;
  @ApiProperty() @IsString() address!: string;
  @ApiProperty() @IsString() city!: string;
  @ApiProperty() @IsString() state!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hospitalPhone?: string;
  @ApiProperty() @IsEmail() hospitalEmail!: string;
  @ApiProperty({ enum: HospitalType }) @IsEnum(HospitalType) hospitalType!: HospitalType;
  @ApiProperty() @IsString() licenseNumber!: string;

  @ApiProperty() @IsString() adminFirstName!: string;
  @ApiProperty() @IsString() adminLastName!: string;
  @ApiProperty() @IsEmail() adminEmail!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adminPhone?: string;
}
