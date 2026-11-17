import { IsString, MinLength, IsEnum, IsOptional, IsMongoId, MaxLength, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantRole } from '@medicore/shared-types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  territory: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address: string;

  @IsEnum(TenantRole)
  tenantRole: TenantRole;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  roleId?: string;

  @IsMongoId({ message: 'branchId is required' })
  branchId: string;
}
