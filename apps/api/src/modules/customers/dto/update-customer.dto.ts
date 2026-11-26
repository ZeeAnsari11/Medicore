import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateCustomerDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  /** Optional on edit, but never blank: an edit cannot erase the address, territory or city. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  @IsOptional()
  address?: string;

  /** An empty string clears the code. */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  code?: string;

  /** National Tax Number; an empty string clears it. */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  ntn?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  territory?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  city?: string;

  @IsBoolean()
  @IsOptional()
  isDealer?: boolean;
}
