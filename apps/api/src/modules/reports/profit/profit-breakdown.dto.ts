import { IsIn, IsMongoId, IsOptional, Matches } from 'class-validator';
import type { ProfitGroupBy } from '@medicore/shared-types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const PROFIT_GROUP_BYS: readonly ProfitGroupBy[] = [
  'customer',
  'vendor',
  'manufacturer',
  'orderBooker',
  'city',
  'territory',
  'product',
];

export class ProfitBreakdownQueryDto {
  @IsIn(PROFIT_GROUP_BYS)
  groupBy: ProfitGroupBy;

  /** Karachi calendar day, yyyy-mm-dd. */
  @Matches(DAY)
  from: string;

  @Matches(DAY)
  to: string;

  @IsOptional() @IsMongoId() branchId?: string;
}
