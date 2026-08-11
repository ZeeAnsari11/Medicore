import { IsString, MinLength, IsArray, IsMongoId, IsOptional } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  permissionIds?: string[];
}
