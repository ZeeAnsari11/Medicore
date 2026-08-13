import { IsString, MinLength, IsArray, IsOptional } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  allowedModules: string[];
}
