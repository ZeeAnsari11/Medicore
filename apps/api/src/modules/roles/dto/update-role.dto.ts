import { IsString, MinLength, IsArray, IsOptional } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedModules?: string[];
}
