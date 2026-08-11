import { IsString, MinLength, IsEmail } from 'class-validator';

export class CreatePlatformTenantDto {
  @IsString()
  @MinLength(2)
  tenantName: string;

  @IsString()
  @MinLength(2)
  adminFullName: string;

  @IsEmail()
  adminEmail: string;
}
