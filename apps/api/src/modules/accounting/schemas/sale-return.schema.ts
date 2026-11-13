import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import {
  PaymentMethod,
  ReturnCondition,
  ReturnReasonCode,
  ReturnSettlementMode,
} from '@medicore/shared-types';

@Schema({ _id: false })
export class ReturnSettlementData {
  @Prop({ required: true, enum: ReturnSettlementMode })
  mode: ReturnSettlementMode;

  @Prop({ enum: PaymentMethod })
  method?: PaymentMethod;

  @Prop({ required: true, min: 0, default: 0 })
  appliedToOutstanding: number;

  @Prop({ required: true, min: 0, default: 0 })
  refundAmount: number;

  @Prop({ required: true, min: 0, default: 0 })
  creditAmount: number;
}

export const ReturnSettlementDataSchema = SchemaFactory.createForClass(ReturnSettlementData);

@Schema({ _id: false })
export class SaleReturnBatchAllocation {
  @Prop({ required: true, type: String })
  batchId: string;

  @Prop({ required: true, trim: true })
  batchNumber: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ enum: ReturnCondition, default: ReturnCondition.RESTOCK })
  condition?: ReturnCondition;

  // Revenue + tax returned, from the ORIGINAL price/discount/tax.
  @Prop({ min: 0 })
  total?: number;

  @Prop({ min: 0 })
  unitCost?: number;
}

export const SaleReturnBatchAllocationSchema =
  SchemaFactory.createForClass(SaleReturnBatchAllocation);

@Schema({ _id: false })
export class SaleReturnItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({ min: 0 })
  unitPrice?: number;

  @Prop({ min: 0, max: 100 })
  discountPercent?: number;

  @Prop({ min: 0, max: 100 })
  taxPercent?: number;

  @Prop({ type: [SaleReturnBatchAllocationSchema], required: true })
  batchAllocations: SaleReturnBatchAllocation[];
}

export const SaleReturnItemSchema = SchemaFactory.createForClass(SaleReturnItem);

export type SaleReturnDocument = HydratedDocument<SaleReturn>;

/**
 * Authoritative return history for a Sale — the source of truth for
 * "how much of batch X from sale Y has already been returned." A new
 * return is only accepted if, per batch allocation, the cumulative
 * previously-returned quantity plus this request's quantity does not
 * exceed what was originally allocated on the sale (see
 * ReturnsService.validateSaleReturnQuantities) — this is what prevents
 * the same inventory quantity from being returned twice.
 */
@Schema({ timestamps: true, collection: 'sale_returns', ...BRANCH_SCOPED })
export class SaleReturn {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: String, ref: 'Sale', index: true })
  saleId: string;

  @Prop({ type: [SaleReturnItemSchema], required: true })
  items: SaleReturnItem[];

  @Prop({ trim: true })
  returnNumber?: string;

  // CANCELLATION = the remainder reversed by Void invoice; counts as returned so nothing is reversed twice.
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

  /** Inherited from the sale being returned (kept in step if the sale is reassigned). */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  orderBookerId?: Types.ObjectId;

  @Prop({ trim: true })
  orderBookerName?: string;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const SaleReturnSchema = SchemaFactory.createForClass(SaleReturn);

SaleReturnSchema.index({ tenantId: 1, saleId: 1 });
SaleReturnSchema.index({ tenantId: 1, branchId: 1, returnDate: -1 });
SaleReturnSchema.index({ tenantId: 1, 'items.batchAllocations.batchId': 1 });
SaleReturnSchema.index({ tenantId: 1, branchId: 1, returnNumber: 1 }, { unique: true, sparse: true });
