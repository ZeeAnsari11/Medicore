import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { ReturnReasonCode } from '@medicore/shared-types';
import { ReturnSettlementData, ReturnSettlementDataSchema } from './sale-return.schema';

@Schema({ _id: false })
export class PurchaseReturnItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({ required: true, type: String })
  batchId: string;

  @Prop({ required: true, trim: true })
  batchNumber: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ min: 0 })
  unitPrice?: number;

  // Share of the ORIGINAL line total (tax included) for the returned quantity.
  @Prop({ min: 0 })
  total?: number;
}

export const PurchaseReturnItemSchema = SchemaFactory.createForClass(PurchaseReturnItem);

export type PurchaseReturnDocument = HydratedDocument<PurchaseReturn>;

/**
 * Authoritative return history for a Purchase, symmetric to SaleReturn.
 * Purchase lines are single-batch (unlike Sale's multi-batch allocations —
 * receiving always upserts exactly one batch per line), so items reference
 * one batchId directly rather than an allocations array.
 */
@Schema({ timestamps: true, collection: 'purchase_returns', ...BRANCH_SCOPED })
export class PurchaseReturn {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: String, ref: 'Purchase', index: true })
  purchaseId: string;

  @Prop({ type: [PurchaseReturnItemSchema], required: true })
  items: PurchaseReturnItem[];

  @Prop({ trim: true })
  returnNumber?: string;

  @Prop({ enum: ['RETURN', 'CANCELLATION'], default: 'RETURN' })
  kind?: 'RETURN' | 'CANCELLATION';

  @Prop({ trim: true })
  reason?: string;

  @Prop({ enum: ReturnReasonCode })
  reasonCode?: ReturnReasonCode;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ min: 0 })
  total?: number;

  @Prop({ type: ReturnSettlementDataSchema })
  settlement?: ReturnSettlementData;

  @Prop({ required: true, default: Date.now })
  returnDate: Date;

  @Prop({ required: true, type: String })
  journalEntryId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const PurchaseReturnSchema = SchemaFactory.createForClass(PurchaseReturn);

PurchaseReturnSchema.index({ tenantId: 1, purchaseId: 1 });
PurchaseReturnSchema.index({ tenantId: 1, branchId: 1, returnNumber: 1 }, { unique: true, sparse: true });
