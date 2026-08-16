import { IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  name: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsMongoId()
  parentCategoryId?: string;
}
