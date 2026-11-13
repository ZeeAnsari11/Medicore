import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '@medicore/shared-types';

export class CreateExpenseDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  expenseAccountId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDateString()
  @IsOptional()
  expenseDate?: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsString()
  paymentAccountId: string;

  @IsMongoId()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsString()
  @IsOptional()
  reference?: string;
}
