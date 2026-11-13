import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateVendorDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  company?: string;

  @IsString()
  @IsOptional()
  distributorType?: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
