import { IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProductDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  genericName?: string;

  @IsMongoId()
  @IsOptional()
  manufacturerId?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  packing?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  dealerPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;
}
