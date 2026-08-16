import { IsBoolean } from 'class-validator';

export class UpdateVendorStatusDto {
  @IsBoolean()
  isActive: boolean;
}
