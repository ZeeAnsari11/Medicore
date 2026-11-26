import { IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsPositive, IsString, Min, MinLength } from 'class-validator';

export class CreateFixedAssetDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @IsPositive()
  cost: number;

  @IsDateString()
  @IsOptional()
  purchaseDate?: string;

  @IsIn(['CASH', 'BANK', 'EXISTING'])
  source: 'CASH' | 'BANK' | 'EXISTING';

  @IsString()
  @IsOptional()
  notes?: string;
}

export class DisposeFixedAssetDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsNumber()
  @Min(0)
  proceeds: number;

  @IsIn(['CASH', 'BANK'])
  method: 'CASH' | 'BANK';
}
