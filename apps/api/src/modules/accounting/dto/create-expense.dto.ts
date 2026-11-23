import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod } from '@medicore/shared-types';

export class CreateExpenseDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  /** The account to charge. Optional when `categoryId` is sent (that category's account is used). */
  @IsString({ message: 'Choose an expense category' })
  @ValidateIf((o: CreateExpenseDto) => !o.categoryId)
  expenseAccountId?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  /** Must belong to `categoryId`. */
  @IsString()
  @IsOptional()
  subCategoryId?: string;

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
