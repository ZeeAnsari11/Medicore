import { IsEnum, IsNumber, IsPositive, IsString } from 'class-validator';
import { InvoiceType } from '@medicore/shared-types';

export class AllocatePaymentDto {
  @IsEnum(InvoiceType)
  invoiceType: InvoiceType;

  @IsString()
  invoiceId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
