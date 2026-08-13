import { IsString, MinLength, IsEmail, IsOptional } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  adminFullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
