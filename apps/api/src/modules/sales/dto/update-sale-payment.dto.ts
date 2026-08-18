import { IsEnum, IsNumber, Min } from 'class-validator';
import { PaymentStatus } from '@medicore/shared-types';

export class UpdateSalePaymentDto {
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @IsNumber()
  @Min(0)
  amountPaid: number;
}
