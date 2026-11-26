import { Type } from 'class-transformer';
import { IsMongoId, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class LedgerQueryDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  /** General ledger only. */
  @IsOptional()
  @IsString()
  accountId?: string;

  /** Inclusive start (yyyy-mm-dd or ISO). Everything before it becomes the opening balance. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive end; a bare yyyy-mm-dd covers the whole day. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Export routes only. `statement` is the party statement to send out. */
  @IsOptional()
  @IsIn(['csv', 'pdf', 'statement'])
  format?: 'csv' | 'pdf' | 'statement';
}

export class PartyBalancesQueryDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Only parties with a non-zero balance or advance. */
  @IsOptional()
  @IsIn(['true', 'false'])
  hasBalance?: 'true' | 'false';

  /** Inclusive start (yyyy-mm-dd or ISO): the period for invoiced / received / returns; earlier activity becomes the opening balance. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Inclusive end; a bare yyyy-mm-dd covers the whole day. Balances are as of this date. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['name', 'balance'])
  sortBy?: 'name' | 'balance';

  /** Export only (`.../balances/export`): the file type. */
  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
