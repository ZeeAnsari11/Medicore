import {
  IsEmail,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
} from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  platformName?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string | null;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultTrialDays?: number;

  @IsOptional()
  @IsMongoId()
  defaultPlanId?: string | null;

  @IsOptional()
  @IsString()
  contactPhone?: string | null;
}
