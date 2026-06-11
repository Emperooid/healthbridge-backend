import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsObject } from 'class-validator';

export class CreateEncounterDto {
  @ApiProperty()
  @IsUUID()
  visitId: string;

  @ApiPropertyOptional({ example: 'Chest pain radiating to the left arm' })
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional({ example: 'Regular heartbeat, no murmurs' })
  @IsOptional()
  @IsString()
  examination?: string;

  @ApiPropertyOptional({ example: 'Possible angina' })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({ example: 'Refer for ECG and stress test' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: { temperature: '37.2°C', bloodPressure: '120/80', pulse: '72bpm', weight: '75kg' },
  })
  @IsOptional()
  @IsObject()
  vitalSigns?: Record<string, unknown>;
}
