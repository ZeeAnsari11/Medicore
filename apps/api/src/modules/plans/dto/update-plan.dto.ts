import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min, MinLength } from 'class-validator';
import { BillingInterval } from '@medicore/shared-types';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code, e.g. USD' })
  currency?: string;

  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers?: number | null;
}
