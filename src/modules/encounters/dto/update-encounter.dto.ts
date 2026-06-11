import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateEncounterDto } from './create-encounter.dto';

export class UpdateEncounterDto extends PartialType(OmitType(CreateEncounterDto, ['visitId'] as const)) {}
