import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListCashPaymentTransactionsQueryDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  /** Matches the transaction number (PT-0001), the voucher number (CP-000001), a vendor name or an invoice number. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;

  /** Inclusive lower bound on the receipt date (yyyy-mm-dd or ISO). */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** Inclusive upper bound; a bare yyyy-mm-dd covers the whole day. */
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
