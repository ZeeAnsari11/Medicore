import { Transform } from 'class-transformer';
import { IsBoolean, IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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

  /** Required with territory and city so every customer can be filtered and grouped on the supply reports. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address: string;

  /** Printed on the supply summary; unique per tenant when set. */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  code?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  territory: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city: string;

  @IsBoolean()
  @IsOptional()
  isDealer?: boolean;
}
