import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateCashTransactionRowDto {
  /** Present for an existing entry of the transaction; absent for a new row. */
  @IsOptional()
  @IsString()
  entryId?: string;

  @IsString()
  invoiceId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  /** Only for a new row; an entry that already has a difference can't be edited, only removed. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  difference?: number;
}

export class UpdateCashTransactionDto {
  /** The version the client loaded; a newer stored version means someone else edited it (409). */
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpdateCashTransactionRowDto)
  rows: UpdateCashTransactionRowDto[];
}
