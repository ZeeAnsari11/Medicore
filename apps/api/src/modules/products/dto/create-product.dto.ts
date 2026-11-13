import { IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsNotEmpty()
  genericName: string;

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
  tp: number;

  @IsNumber()
  @Min(0)
  cp: number;

  @IsNumber()
  @Min(0)
  rp: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;
}
