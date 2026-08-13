import { IsEnum } from 'class-validator';
import { PlanStatus } from '@medicore/shared-types';

export class UpdatePlanStatusDto {
  @IsEnum(PlanStatus)
  status: PlanStatus;
}
