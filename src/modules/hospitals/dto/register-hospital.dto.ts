import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterHospitalDto {
  @IsString() hospitalName!: string;
  @IsString() hospitalAddress!: string;
  @IsOptional() @IsString() hospitalPhone?: string;
  @IsEmail() hospitalEmail!: string;

  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsEmail() adminEmail!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() adminPhone?: string;
}
