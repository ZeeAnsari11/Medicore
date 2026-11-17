import {
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsMongoId,
  MaxLength,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantRole } from '@medicore/shared-types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateUserDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  // Optional only because PATCH is partial; when sent they can't be blank.
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  territory?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address?: string;

  @IsEnum(TenantRole)
  @IsOptional()
  tenantRole?: TenantRole;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  roleId?: string | null;

  // Can be changed but not cleared: '' and null are rejected rather than unassigning the branch.
  @ValidateIf((_, value) => value !== undefined)
  @IsMongoId({ message: 'branchId must be a branch' })
  branchId?: string;
}
