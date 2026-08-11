import { IsString, MinLength, IsEnum, IsOptional, IsMongoId } from 'class-validator';
import { TenantRole } from '@medicore/shared-types';

export class UpdateUserDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  fullName?: string;

  @IsEnum(TenantRole)
  @IsOptional()
  tenantRole?: TenantRole;

  @IsOptional()
  @IsMongoId()
  roleId?: string | null;
}
