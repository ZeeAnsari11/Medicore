import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { AllocationMode, PaymentMethod, PaymentStatus, ReturnStatus, SaleStatus } from '@medicore/shared-types';

@Schema({ _id: false })
export class SaleBatchAllocation {
  @Prop({ required: true, type: String })
  batchId: string;

  @Prop({ required: true, trim: true })
  batchNumber: string;

  @Prop({ required: true })
  expiryDate: Date;

  @Prop({ required: true, min: 0 })
  quantity: number;
}

export const SaleBatchAllocationSchema = SchemaFactory.createForClass(SaleBatchAllocation);

@Schema({ _id: false })
export class SaleItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId: Types.ObjectId;

  // Denormalized snapshot — keeps the invoice historically accurate even if
  // the product is later renamed/discontinued.
  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ min: 0, max: 100 })
  discountPercent?: number;

  @Prop({ min: 0, max: 100 })
  taxPercent?: number;

  @Prop({ required: true, min: 0 })
  lineTotal: number;

  @Prop({ required: true, enum: AllocationMode, default: AllocationMode.FEFO })
  allocationMode: AllocationMode;

  @Prop({ type: [SaleBatchAllocationSchema], required: true })
  batchAllocations: SaleBatchAllocation[];

  /** Free units given on top of `quantity`: they leave stock (and count in cost) but are not charged. */
  @Prop({ min: 0, default: 0 })
  bonusQuantity?: number;

  @Prop({ type: [SaleBatchAllocationSchema], default: [] })
  bonusAllocations?: SaleBatchAllocation[];
}

export const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

export type SaleDocument = HydratedDocument<Sale>;

/**
 * Sale is the invoice — no separate Invoice entity. Offline-creatable (a
 * branch may sell without connectivity), so it uses a client-generatable
 * UUIDv7 id and soft delete, same profile as Batch/StockMovement/Purchase.
 */
@Schema({ timestamps: true, collection: 'sales', ...BRANCH_SCOPED })
export class Sale {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ type: String, ref: 'Customer', index: true })
  customerId?: string;

  /** Issued on confirmation, so a PENDING order has none. */
  @Prop({ trim: true })
  invoiceNumber?: string;

  /** Absent means CONFIRMED, so sales that predate order processing need no migration. */
  @Prop({ enum: SaleStatus })
  status?: SaleStatus;

  /** PO-{branch code}-000001, set on orders booked as PENDING. */
  @Prop({ trim: true })
  orderNumber?: string;

  @Prop({ type: [SaleItemSchema], required: true })
  items: SaleItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  discountTotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxTotal: number;

  @Prop({ required: true, min: 0 })
  grandTotal: number;

  @Prop({ required: true, enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Prop({ required: true, enum: PaymentStatus, default: PaymentStatus.PAID })
  paymentStatus: PaymentStatus;

  @Prop({ required: true, min: 0, default: 0 })
  amountPaid: number;

  /** The part of `amountPaid` that came from the customer's advance (no cash moved). */
  @Prop({ min: 0, default: 0 })
  advanceApplied?: number;

  @Prop({ required: true, default: Date.now })
  saleDate: Date;

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

  /** The user who placed the sale. The id is for integrity and filtering; the UI shows the name. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  orderBookerId: Types.ObjectId;

  /** The booker's name when the sale was booked: later renames do not rewrite old sales. */
  @Prop({ required: true, trim: true })
  orderBookerName: string;

  /**
   * Optional client-generated id of the request that created this sale (offline PWA). A replay of the same request
   * returns this sale instead of creating (and numbering, and stocking out) a second one — like CashReceipt.batchId.
   */
  @Prop({ type: String })
  clientOpId?: string;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);

// Partial: a PENDING order has no invoice number yet, and absent values would otherwise collide.
SaleSchema.index(
  { tenantId: 1, branchId: 1, invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: 'string' } } },
);
SaleSchema.index({ tenantId: 1, clientOpId: 1 }, { unique: true, partialFilterExpression: { clientOpId: { $type: 'string' } } });
SaleSchema.index({ tenantId: 1, branchId: 1, status: 1, saleDate: -1 });
SaleSchema.index({ tenantId: 1, customerId: 1, saleDate: -1 });
SaleSchema.index({ tenantId: 1, orderBookerId: 1, saleDate: -1 });
SaleSchema.index({ tenantId: 1, branchId: 1, saleDate: -1 });
SaleSchema.index({ tenantId: 1, 'items.batchAllocations.batchId': 1 });
SaleSchema.index({ tenantId: 1, 'items.productId': 1, saleDate: -1 });
