import { IsBoolean } from 'class-validator';

export class UpdateManufacturerStatusDto {
  @IsBoolean()
  isActive: boolean;
}
