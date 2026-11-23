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
import { PaymentMethod, PaymentStatus } from '@medicore/shared-types';

export class ManualBatchAllocationDto {
  @IsString()
  batchId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreateSaleItemDto {
  @IsMongoId()
  productId: string;

  // 0 is allowed so a line can be bonus only; planItems rejects a line with neither quantity nor bonus.
  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  bonusQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualBatchAllocationDto)
  @IsOptional()
  manualAllocations?: ManualBatchAllocationDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualBatchAllocationDto)
  @IsOptional()
  bonusManualAllocations?: ManualBatchAllocationDto[];
}

export class CreateSaleDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  /** Book the sale for another Order Booker (needs sales:book_for_others); defaults to the caller. */
  @IsMongoId()
  @IsOptional()
  orderBookerId?: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amountPaid?: number;

  /** Pay (part of) the invoice from the customer's advance; the server works out how much. */
  @IsBoolean()
  @IsOptional()
  applyAdvance?: boolean;

  @IsDateString()
  @IsOptional()
  saleDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];
}
