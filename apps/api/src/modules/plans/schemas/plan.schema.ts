import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BillingInterval, PlanStatus } from '@medicore/shared-types';

export type PlanDocument = HydratedDocument<Plan>;

@Schema({ timestamps: true, collection: 'plans' })
export class Plan {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, default: '' })
  description: string;

  @Prop({ required: true, min: 0 })
  priceCents: number;

  @Prop({ required: true, trim: true, default: 'USD' })
  currency: string;

  @Prop({ required: true, enum: BillingInterval, default: BillingInterval.MONTHLY })
  billingInterval: BillingInterval;

  @Prop({ type: Number, default: null })
  maxUsers: number | null;

  @Prop({ required: true, enum: PlanStatus, default: PlanStatus.ACTIVE })
  status: PlanStatus;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
