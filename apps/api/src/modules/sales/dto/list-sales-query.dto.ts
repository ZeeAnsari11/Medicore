import { Type } from 'class-transformer';
import { IsMongoId, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaymentStatus, ReturnStatus } from '@medicore/shared-types';

export class ListSalesQueryDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  /** Filter by Order Booker; ignored for users who can only see their own sales. */
  @IsOptional()
  @IsMongoId()
  orderBookerId?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  /** PARTIAL or FULL, or ANY for either. */
  @IsOptional()
  @IsIn([ReturnStatus.PARTIAL, ReturnStatus.FULL, 'ANY'])
  returnStatus?: ReturnStatus.PARTIAL | ReturnStatus.FULL | 'ANY';

  /** Inclusive lower bound on saleDate (yyyy-mm-dd or ISO). */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** Inclusive upper bound; a bare yyyy-mm-dd covers the whole day. */
  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** Matches invoiceNumber. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;

  /** Omit page and limit to get the unpaginated array (used by dropdowns on other pages). */
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
