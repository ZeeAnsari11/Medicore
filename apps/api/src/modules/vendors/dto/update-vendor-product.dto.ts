import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateVendorProductDto {
  @IsString()
  @IsOptional()
  vendorSku?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice?: number;

  @IsBoolean()
  @IsOptional()
  isPreferred?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
