import { IsString, MinLength, Matches, IsOptional } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9]*(:[a-z][a-z0-9-]+)+$/, {
    message: 'key must look like "module:action" (e.g., "users:read", "roles:delete")',
  })
  key: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @MinLength(2)
  module: string;
}
