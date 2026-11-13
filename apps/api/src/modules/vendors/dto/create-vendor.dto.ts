import { IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVendorDto {
  @IsString()
  @MinLength(2)
  company: string;

  /** Admins must name the branch; branch users are always pinned to their own. */
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  distributorType?: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
