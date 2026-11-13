import { IsBoolean, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  name: string;

  /** Admins must name the branch; branch users are always pinned to their own. */
  @IsMongoId()
  @IsOptional()
  branchId?: string;

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
