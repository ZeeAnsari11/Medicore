import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVendorDto {
  @IsString()
  @MinLength(2)
  company: string;

  @IsString()
  @IsOptional()
  distributorType?: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
