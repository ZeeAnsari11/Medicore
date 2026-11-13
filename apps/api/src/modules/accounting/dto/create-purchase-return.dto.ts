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

export class CreatePurchaseReturnItemDto {
  @IsMongoId()
  productId: string;

  @IsString()
  batchId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreatePurchaseReturnDto {
  /** Taken from the URL on `POST /purchases/:id/returns`. */
  @IsString()
  @IsOptional()
  purchaseId: string;

  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnItemDto)
  items: CreatePurchaseReturnItemDto[];

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
