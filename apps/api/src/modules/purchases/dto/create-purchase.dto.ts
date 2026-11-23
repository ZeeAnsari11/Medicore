import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

  /** Edit only: the batch this line sits on today, so a changed batch number can move just the units still in stock. */
  // Batch ids are UUID strings, not Mongo ObjectIds.
  @IsString()
  @IsOptional()
  sourceBatchId?: string;
}

export class PurchasePriceUpdateDto {
  @IsMongoId()
  productId: string;

  @IsBoolean()
  updatePrices: boolean;
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

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amountPaid?: number;

  /** Spend the vendor's unspent advance on this bill first (the form asks before saving). */
  @IsBoolean()
  @IsOptional()
  applyAdvance?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items: CreatePurchaseItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchasePriceUpdateDto)
  @IsOptional()
  priceUpdates?: PurchasePriceUpdateDto[];
}
