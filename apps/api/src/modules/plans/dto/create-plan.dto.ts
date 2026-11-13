import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { BillingInterval } from '@medicore/shared-types';

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  description: string;

  @IsInt()
  @Min(0)
  priceCents: number;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code, e.g. USD' })
  currency: string;

  @IsEnum(BillingInterval)
  billingInterval: BillingInterval;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsers: number | null;
}
