import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreatePlatformTenantDto {
  @IsString()
  @MinLength(2)
  tenantName: string;

  @IsString()
  @MinLength(2)
  adminFullName: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'username may only contain letters, numbers, dots, dashes and underscores' })
  adminUsername: string;
}
