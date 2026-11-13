import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PartyType } from '@medicore/shared-types';

export class CreateManualJournalEntryLineDto {
  @IsString()
  accountId: string;

  @IsNumber()
  @Min(0)
  debit: number;

  @IsNumber()
  @Min(0)
  credit: number;

  @IsEnum(PartyType)
  @IsOptional()
  partyType?: PartyType;

  @IsString()
  @IsOptional()
  partyId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateManualJournalEntryDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  @IsOptional()
  entryDate?: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateManualJournalEntryLineDto)
  lines: CreateManualJournalEntryLineDto[];
}
