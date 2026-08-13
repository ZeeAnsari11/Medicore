import { IsMongoId } from 'class-validator';

export class AssignSubscriptionPlanDto {
  @IsMongoId()
  planId: string;
}
