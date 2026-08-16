import { IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateCategoryDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  parentCategoryId?: string;
}
