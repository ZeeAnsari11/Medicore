import { IsString, MinLength, IsEnum, IsOptional, IsMongoId } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantRole } from '@medicore/shared-types';

export class UpdateUserDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  fullName?: string;

  @IsEnum(TenantRole)
  @IsOptional()
  tenantRole?: TenantRole;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  roleId?: string | null;
}
