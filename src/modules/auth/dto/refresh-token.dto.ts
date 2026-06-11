import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token to revoke. Omit to revoke all sessions.' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
