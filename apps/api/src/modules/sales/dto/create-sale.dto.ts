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

  @IsNumber()
  @IsPositive()
  quantity: number;

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
}

export class CreateSaleDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

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

  @IsDateString()
  @IsOptional()
  saleDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];
}
