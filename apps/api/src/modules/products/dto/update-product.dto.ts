import { IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProductDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

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
  tp?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  cp?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  rp?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;
}
