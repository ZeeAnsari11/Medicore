import { IsBoolean, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateManufacturerDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  website?: string;

  /** Also create a Vendor with the same name/contact details, atomically. */
  @IsBoolean()
  @IsOptional()
  alsoCreateVendor?: boolean;
}
