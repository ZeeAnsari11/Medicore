import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreateBatchAdjustmentDto {
  @IsMongoId()
  productId: string;

  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  batchNumber: string;

  @IsDateString()
  expiryDate: string;

  @IsIn(['add', 'subtract', 'set'])
  operation: 'add' | 'subtract' | 'set';

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice?: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
