import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SubscriptionStatus } from '@medicore/shared-types';

export type SubscriptionDocument = HydratedDocument<Subscription>;

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', unique: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Plan' })
  planId: Types.ObjectId;

  @Prop({ required: true, enum: SubscriptionStatus, default: SubscriptionStatus.TRIALING })
  status: SubscriptionStatus;

  @Prop({ required: true })
  currentPeriodStart: Date;

  @Prop({ required: true })
  currentPeriodEnd: Date;

  @Prop({ type: Date, default: null })
  canceledAt: Date | null;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
