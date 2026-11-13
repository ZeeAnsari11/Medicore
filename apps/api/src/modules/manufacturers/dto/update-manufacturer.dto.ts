import { IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateManufacturerDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

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
}
