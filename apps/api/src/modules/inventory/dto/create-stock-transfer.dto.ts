import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsMongoId, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';

export class StockTransferLineDto {
  @IsString()
  batchId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;
}

export class CreateStockTransferDto {
  /** Source branch; branch users always send from their own, admins name it (or select it). */
  @IsOptional()
  @IsMongoId()
  fromBranchId?: string;

  @IsMongoId()
  toBranchId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferLineDto)
  lines: StockTransferLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
