import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { InvoiceType, PartyType, PaymentMethod } from '@medicore/shared-types';

export class CreatePaymentAllocationDto {
  @IsEnum(InvoiceType)
  invoiceType: InvoiceType;

  @IsString()
  invoiceId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}

export class CreatePaymentDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsEnum(PartyType)
  partyType: PartyType;

  @IsString()
  partyId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsString()
  accountId: string;

  @IsDateString()
  @IsOptional()
  paymentDate?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentAllocationDto)
  @IsOptional()
  allocations?: CreatePaymentAllocationDto[];
}
