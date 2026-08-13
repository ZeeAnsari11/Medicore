import { IsEnum } from 'class-validator';
import { SubscriptionStatus } from '@medicore/shared-types';

export class UpdateSubscriptionStatusDto {
  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;
}
