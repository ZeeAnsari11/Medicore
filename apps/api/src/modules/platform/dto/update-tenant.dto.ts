import { IsString, MinLength, IsOptional, MaxLength, Matches } from 'class-validator';

export class UpdateTenantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  adminFullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'username may only contain letters, numbers, dots, dashes and underscores' })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
