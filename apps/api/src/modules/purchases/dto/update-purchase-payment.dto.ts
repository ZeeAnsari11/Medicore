import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@medicore/shared-types';

export class UpdatePurchasePaymentDto {
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @IsNumber()
  @Min(0)
  amountPaid: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
