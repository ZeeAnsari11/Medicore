import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';

export type CustomerDocument = HydratedDocument<Customer>;

/**
 * Not branch-scoped — a customer plausibly buys from more than one branch.
 * Offline-creatable (created ad-hoc mid-sale), so it uses a client-
 * generatable UUIDv7 id and soft delete, same profile as Sale/Purchase/Batch.
 */
@Schema({ timestamps: true, collection: 'customers' })
export class Customer {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ required: true, default: false })
  isDealer: boolean;

  @Prop({ required: true, default: 0 })
  totalDue: number;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ tenantId: 1, phone: 1 });
CustomerSchema.index({ name: 'text' });
