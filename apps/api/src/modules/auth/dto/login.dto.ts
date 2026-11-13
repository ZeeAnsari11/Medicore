import { IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  username: string;

  @IsString()
  @MinLength(1)
  password: string;

  /** Tenant slug. Only needed when the same username and password exist in more than one organization. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  organization?: string;
}
