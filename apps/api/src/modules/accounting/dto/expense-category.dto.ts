import { IsBoolean, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  /** Omit for a main category; the main category's id for a sub-category. */
  @IsString()
  @IsOptional()
  parentId?: string;

  /** Branch of a new main category (admins pick it; a branch user's own branch is used). A sub-category takes its category's. */
  @IsMongoId()
  @IsOptional()
  branchId?: string;
}

export class UpdateExpenseCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
