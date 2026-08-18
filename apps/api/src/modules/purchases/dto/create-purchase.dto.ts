import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentStatus } from '@medicore/shared-types';

export class CreatePurchaseItemDto {
  @IsMongoId()
  productId: string;

  @IsString()
  batchNumber: string;

  @IsDateString()
  expiryDate: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  taxPercent?: number;
}

export class CreatePurchaseDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsMongoId()
  vendorId: string;

  @IsString()
  @IsOptional()
  vendorInvoiceNumber?: string;

  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amountPaid?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items: CreatePurchaseItemDto[];
}
