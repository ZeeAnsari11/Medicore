import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional, IsString, Matches } from 'class-validator';

const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class SupplyReportQueryDto {
  /** Karachi calendar day, yyyy-mm-dd. Required unless an invoice number range is given, which makes the dates not apply. */
  @IsOptional() @Matches(DAY) from?: string;

  @IsOptional() @Matches(DAY) to?: string;

  @IsOptional() @IsMongoId() branchId?: string;

  /** Invoice numbers are compared numerically. */
  @IsOptional() @Matches(/^\d+$/) invoiceFrom?: string;
  @IsOptional() @Matches(/^\d+$/) invoiceTo?: string;

  @IsOptional() @Transform(csv) @IsString({ each: true }) city?: string[];
  @IsOptional() @Transform(csv) @IsString({ each: true }) territory?: string[];
  @IsOptional() @Transform(csv) @IsMongoId({ each: true }) orderBookerIds?: string[];
  @IsOptional() @Transform(csv) @IsString({ each: true }) customerIds?: string[];
  @IsOptional() @Transform(csv) @IsMongoId({ each: true }) manufacturerIds?: string[];
}
