import { PartialType, OmitType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['email', 'password'] as const)) {}

export class UpdateRoleDto {
  @ApiPropertyOptional({ enum: Role })
  @IsEnum(Role)
  role: Role;
}

export class UpdateUserStatusDto {
  @ApiPropertyOptional()
  @IsBoolean()
  isActive: boolean;
}
