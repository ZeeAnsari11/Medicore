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

export class UpdateCashPaymentTransactionRowDto {
  /** Present for an existing entry of the transaction; absent for a new row. */
  @IsOptional()
  @IsString()
  entryId?: string;

  @IsString()
  invoiceId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  /** Difference written off with this entry. Omitted on an existing entry = keep the stored one; 0 takes it off. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  difference?: number;
}

export class UpdateCashPaymentTransactionDto {
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
  @Type(() => UpdateCashPaymentTransactionRowDto)
  rows: UpdateCashPaymentTransactionRowDto[];
}
