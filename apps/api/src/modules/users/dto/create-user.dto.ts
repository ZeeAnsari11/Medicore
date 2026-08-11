import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsMongoId } from 'class-validator';
import { TenantRole } from '@medicore/shared-types';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEnum(TenantRole)
  tenantRole: TenantRole;

  @IsOptional()
  @IsMongoId()
  roleId?: string;
}
