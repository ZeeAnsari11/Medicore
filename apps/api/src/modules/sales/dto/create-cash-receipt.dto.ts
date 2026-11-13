import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@medicore/shared-types';

export class CashReceiptRowDto {
  @IsString()
  invoiceId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class CreateCashReceiptDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsUUID()
  batchId: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CashReceiptRowDto)
  rows: CashReceiptRowDto[];
}
