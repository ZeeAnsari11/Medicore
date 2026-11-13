import { Transform } from 'class-transformer';
import { IsMongoId, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value;
const bool = ({ value }: { value: unknown }) => value === true || value === 'true';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const SSR_VIEWS = ['manufacturer', 'vendor', 'product', 'grouped'] as const;
export type SsrView = (typeof SSR_VIEWS)[number];

export class SsrQueryDto {
  @IsOptional()
  @IsIn(SSR_VIEWS)
  view?: SsrView;

  /** Karachi calendar day, yyyy-mm-dd. */
  @Matches(DAY)
  from: string;

  @Matches(DAY)
  to: string;

  @IsOptional() @IsMongoId() branchId?: string;

  @IsOptional() @Transform(csv) @IsString({ each: true }) manufacturerIds?: string[];
  @IsOptional() @Transform(csv) @IsString({ each: true }) vendorIds?: string[];
  @IsOptional() @Transform(csv) @IsString({ each: true }) productIds?: string[];
  /** Customer ids; the token `walkin` selects invoices without a customer. */
  @IsOptional() @Transform(csv) @IsString({ each: true }) customerIds?: string[];
  @IsOptional() @Transform(csv) @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @Transform(csv) @IsString({ each: true }) salesmanIds?: string[];

  @IsOptional() @IsIn(['cash', 'credit']) paymentType?: 'cash' | 'credit';

  @IsOptional() @Transform(bool) @IsBoolean() compare?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() includeVoided?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() includeZero?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() includeInactive?: boolean;
  /** Count returns in the period of the original sale instead of the return date. */
  @IsOptional() @Transform(bool) @IsBoolean() attributeToSale?: boolean;

  @IsOptional() @IsString() @MaxLength(100) search?: string;
  /** field:asc|desc, e.g. netSales:desc */
  @IsOptional() @IsString() @MaxLength(40) sort?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export const SSR_COLUMN_KEYS = [
  'pack', 'rate', 'opening', 'purchased', 'totalStock', 'grossSale', 'bonus', 'netSale', 'netSaleValue', 'expBrk',
  'transferIn', 'transferOut', 'closingQty', 'closingValue', 'closingValueCp', 'prevNetSales', 'changePct',
] as const;

export class SsrExportQueryDto extends SsrQueryDto {
  @IsIn(['xlsx', 'csv', 'pdf']) format: 'xlsx' | 'csv' | 'pdf';

  /** Columns to include (the ones ticked in the on-screen Columns menu); omitted means all. */
  @IsOptional() @Transform(csv) @IsIn(SSR_COLUMN_KEYS, { each: true }) columns?: string[];
}
