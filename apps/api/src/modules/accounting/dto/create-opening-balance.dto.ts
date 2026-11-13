import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateManualJournalEntryLineDto } from './create-manual-journal-entry.dto';

export class CreateOpeningBalanceDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  @IsOptional()
  entryDate?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateManualJournalEntryLineDto)
  lines: CreateManualJournalEntryLineDto[];
}
