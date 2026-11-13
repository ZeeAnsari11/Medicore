import { IsString, MinLength, IsEnum, IsOptional, IsMongoId, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantRole } from '@medicore/shared-types';

export class UpdateUserDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsEnum(TenantRole)
  @IsOptional()
  tenantRole?: TenantRole;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  roleId?: string | null;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  branchId?: string | null;
}
