import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRecordDto } from './create-record.dto';

export class UpdateRecordDto extends PartialType(
  OmitType(CreateRecordDto, ['patientId', 'doctorId', 'hospitalId'] as const),
) {}
