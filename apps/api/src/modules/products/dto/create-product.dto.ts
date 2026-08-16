import { IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  genericName?: string;

  @IsMongoId()
  manufacturerId: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  unit: string;

  @IsString()
  @IsOptional()
  packing?: string;

  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @IsNumber()
  @Min(0)
  salePrice: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  dealerPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;
}
