import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignDoctorDto {
  @ApiProperty({ example: 'uuid-of-doctor' })
  @IsUUID()
  doctorId!: string;
}
