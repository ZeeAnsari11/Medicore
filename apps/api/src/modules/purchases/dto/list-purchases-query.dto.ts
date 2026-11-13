import { Type } from 'class-transformer';
import { IsMongoId, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaymentStatus, PurchaseStatus, ReturnStatus } from '@medicore/shared-types';

export class ListPurchasesQueryDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  /** PARTIAL or FULL, or ANY for either. */
  @IsOptional()
  @IsIn([ReturnStatus.PARTIAL, ReturnStatus.FULL, 'ANY'])
  returnStatus?: ReturnStatus.PARTIAL | ReturnStatus.FULL | 'ANY';

  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  /** Inclusive lower bound on purchaseDate (yyyy-mm-dd or ISO). */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Inclusive upper bound; a bare yyyy-mm-dd covers the whole day. */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /** Matches purchaseNumber. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;

  /** Omit page to get the unpaginated array (used by dropdowns on other pages). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
