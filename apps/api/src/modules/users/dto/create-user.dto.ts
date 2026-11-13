import { IsString, MinLength, IsEnum, IsOptional, IsMongoId, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantRole } from '@medicore/shared-types';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'username may only contain letters, numbers, dots, dashes and underscores' })
  username: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsEnum(TenantRole)
  tenantRole: TenantRole;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  roleId?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  branchId?: string;
}
