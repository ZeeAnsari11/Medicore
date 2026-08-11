import { IsEnum } from 'class-validator';
import { TenantStatus } from '@medicore/shared-types';

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  status: TenantStatus;
}
