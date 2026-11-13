import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { PurchaseStatus, PaymentStatus, ReturnStatus } from '@medicore/shared-types';

@Schema({ _id: false })
export class PurchaseItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  batchNumber: string;

  @Prop({ required: true })
  expiryDate: Date;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  purchasePrice: number;

  @Prop({ required: true, min: 0 })
  sellingPrice: number;

  @Prop({ min: 0, max: 100 })
  discountPercent?: number;

  @Prop({ min: 0, max: 100 })
  taxPercent?: number;

  @Prop({ required: true, min: 0 })
  lineTotal: number;

  // Set once the receiving transaction creates/updates the matching Batch.
  @Prop({ type: String })
  batchId?: string;
}

export const PurchaseItemSchema = SchemaFactory.createForClass(PurchaseItem);

export type PurchaseDocument = HydratedDocument<Purchase>;

/**
 * Offline-creatable (a branch may receive stock without connectivity) —
 * UUIDv7 _id and soft delete, same profile as Batch/StockMovement.
 */
@Schema({ timestamps: true, collection: 'purchases', ...BRANCH_SCOPED })
export class Purchase {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Vendor', index: true })
  vendorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  purchaseNumber: string;

  @Prop({ trim: true })
  vendorInvoiceNumber?: string;

  @Prop({ required: true, enum: PurchaseStatus, default: PurchaseStatus.RECEIVED })
  status: PurchaseStatus;

  @Prop({ type: [PurchaseItemSchema], required: true })
  items: PurchaseItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  discountTotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxTotal: number;

  @Prop({ required: true, min: 0 })
  grandTotal: number;

  @Prop({ required: true, enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  @Prop({ required: true, min: 0, default: 0 })
  amountPaid: number;

  @Prop({ required: true, default: Date.now })
  purchaseDate: Date;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  paymentTerms?: string;

  // Bumped by every edit and every amountPaid change: the write conflict serializes a payment against an edit.
  @Prop({ required: true, default: 0 })
  editVersion: number;

  // Return counters. The lines/prices above are never edited by a return;
  // these only track how much has come back so net/outstanding can be derived.
  @Prop({ required: true, min: 0, default: 0 })
  returnedTotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  refundedTotal: number;

  @Prop({ required: true, enum: ReturnStatus, default: ReturnStatus.NONE })
  returnStatus: ReturnStatus;

  // Bumped first in every return transaction: the write conflict serializes concurrent returns.
  @Prop({ required: true, default: 0 })
  returnVersion: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const PurchaseSchema = SchemaFactory.createForClass(Purchase);

PurchaseSchema.index({ tenantId: 1, branchId: 1, purchaseNumber: 1 }, { unique: true });
PurchaseSchema.index({ tenantId: 1, vendorId: 1, purchaseDate: -1 });
PurchaseSchema.index({ tenantId: 1, branchId: 1, purchaseDate: -1 });
PurchaseSchema.index({ tenantId: 1, 'items.batchId': 1 });
