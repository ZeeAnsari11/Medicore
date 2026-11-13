import { IsBoolean, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Body of `POST /products/:productId/vendors` (the product comes from the path). */
export class AddProductVendorDto {
  @IsMongoId()
  vendorId: string;

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

export class CreateVendorProductDto extends AddProductVendorDto {
  @IsMongoId()
  productId: string;
}
