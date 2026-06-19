import { IsEmail, IsString, IsUUID, IsOptional, MinLength } from 'class-validator';

export class InviteDoctorDto {
  @IsEmail() email!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsUUID() hospitalId!: string;
  @IsOptional() @IsString() specialization?: string;
  @IsString() licenseNumber!: string;
}

export class AcceptInviteDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) password!: string;
}
