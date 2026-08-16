import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateManufacturerDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  website?: string;
}
