import { IsString, MinLength, IsOptional } from 'class-validator';

export class UpdatePermissionDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @MinLength(2)
  @IsOptional()
  module?: string;
}
