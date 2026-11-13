import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';

export type CustomerDocument = HydratedDocument<Customer>;

/**
 * Branch-owned: the same person buying at two branches is two records, each with its own balance.
 * Offline-creatable (created ad-hoc mid-sale), so it uses a client-
 * generatable UUIDv7 id and soft delete, same profile as Sale/Purchase/Batch.
 */
@Schema({ timestamps: true, collection: 'customers', ...BRANCH_SCOPED })
export class Customer {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  phone?: string;

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

CustomerSchema.index({ tenantId: 1, branchId: 1, phone: 1 });
