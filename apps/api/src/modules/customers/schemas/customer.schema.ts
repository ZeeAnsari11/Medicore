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

  /** Optional customer code (printed on the supply summary); unique per tenant when set. */
  @Prop({ trim: true })
  code?: string;

  /** National Tax Number (optional). */
  @Prop({ trim: true })
  ntn?: string;

  /** Running customer number per business: 1, 2, 3, ... (shown as the customer ID). */
  @Prop()
  customerSeq?: number;

  @Prop({ trim: true })
  territory?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ required: true, default: false })
  isDealer: boolean;

  @Prop({ required: true, default: 0 })
  totalDue: number;

  /** Bumped when an invoice spends this customer's advance: the write conflict serializes two invoices on one advance. */
  @Prop({ required: true, default: 0 })
  advanceSeq: number;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  /**
   * Optional client-generated id of the request that created this customer (offline PWA). A replay of the same
   * request returns this customer instead of creating a second one — same idea as CashReceipt.batchId.
   */
  @Prop({ type: String })
  clientOpId?: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ tenantId: 1, clientOpId: 1 }, { unique: true, partialFilterExpression: { clientOpId: { $type: 'string' } } });
CustomerSchema.index({ tenantId: 1, branchId: 1, phone: 1 });
CustomerSchema.index({ tenantId: 1, branchId: 1, territory: 1 });
CustomerSchema.index({ tenantId: 1, customerSeq: 1 }, { unique: true, partialFilterExpression: { customerSeq: { $type: 'number' } } });
CustomerSchema.index({ tenantId: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
