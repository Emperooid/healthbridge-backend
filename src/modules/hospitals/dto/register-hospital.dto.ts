import { IsEmail, IsString, IsOptional, MinLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HospitalType } from '@prisma/client';

export class RegisterHospitalDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() address!: string;
  @ApiProperty() @IsString() city!: string;
  @ApiProperty() @IsString() state!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ enum: HospitalType }) @IsEnum(HospitalType) hospitalType!: HospitalType;
  @ApiProperty() @IsString() licenseNumber!: string;

  @ApiProperty() @IsString() adminFirstName!: string;
  @ApiProperty() @IsString() adminLastName!: string;
  @ApiProperty() @IsEmail() adminEmail!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) adminPassword!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adminPhone?: string;
}
