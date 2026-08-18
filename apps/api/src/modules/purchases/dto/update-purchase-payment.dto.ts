import { IsEnum, IsNumber, Min } from 'class-validator';
import { PaymentStatus } from '@medicore/shared-types';

export class UpdatePurchasePaymentDto {
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @IsNumber()
  @Min(0)
  amountPaid: number;
}
