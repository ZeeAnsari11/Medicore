import { IsEnum, IsMongoId, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaymentMethod } from '@medicore/shared-types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filters of the Expense Sheet PDF: the same ones the Expenses page applies on screen. */
export class ExpenseLedgerQueryDto {
  @IsOptional() @IsMongoId() branchId?: string;

  /** Karachi calendar days, yyyy-mm-dd; either end may be left open. */
  @IsOptional() @Matches(DAY) from?: string;
  @IsOptional() @Matches(DAY) to?: string;

  /** Main category (all of its sub-categories unless `subCategoryId` narrows it). */
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() subCategoryId?: string;

  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;

  /** Matches description, reference, vendor and category names. */
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
