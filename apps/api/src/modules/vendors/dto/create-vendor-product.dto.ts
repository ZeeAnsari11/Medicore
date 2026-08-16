import { IsBoolean, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateVendorProductDto {
  @IsMongoId()
  vendorId: string;

  @IsMongoId()
  productId: string;

  @IsString()
  @IsOptional()
  vendorSku?: string;

  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @IsBoolean()
  @IsOptional()
  isPreferred?: boolean;
}
