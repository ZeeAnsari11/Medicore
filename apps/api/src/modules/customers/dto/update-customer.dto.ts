import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsBoolean()
  @IsOptional()
  isDealer?: boolean;
}
