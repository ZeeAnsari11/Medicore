import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AccountType } from '@medicore/shared-types';

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsString()
  @IsOptional()
  parentAccountId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
