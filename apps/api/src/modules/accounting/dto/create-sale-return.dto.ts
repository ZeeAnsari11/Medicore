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
  ValidateNested,
} from 'class-validator';
import { ReturnCondition, ReturnReasonCode } from '@medicore/shared-types';
import { ReturnSettlementDto } from './return-settlement.dto';

export class SaleReturnBatchAllocationDto {
  @IsString()
  batchId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsEnum(ReturnCondition)
  @IsOptional()
  condition?: ReturnCondition;
}

export class CreateSaleReturnItemDto {
  @IsMongoId()
  productId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleReturnBatchAllocationDto)
  batchAllocations: SaleReturnBatchAllocationDto[];
}

export class CreateSaleReturnDto {
  /** Taken from the URL on `POST /sales/:id/returns`. */
  @IsString()
  @IsOptional()
  saleId: string;

  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnItemDto)
  items: CreateSaleReturnItemDto[];

  @IsString()
  @IsOptional()
  reason?: string;

  @IsEnum(ReturnReasonCode)
  @IsOptional()
  reasonCode?: ReturnReasonCode;

  @IsString()
  @IsOptional()
  notes?: string;

  @ValidateNested()
  @Type(() => ReturnSettlementDto)
  @IsOptional()
  settlement?: ReturnSettlementDto;

  @IsDateString()
  @IsOptional()
  returnDate?: string;
}
