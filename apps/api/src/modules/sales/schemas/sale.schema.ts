import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { AllocationMode, PaymentMethod, PaymentStatus } from '@medicore/shared-types';

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
}

export const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

export type SaleDocument = HydratedDocument<Sale>;

/**
 * Sale is the invoice — no separate Invoice entity. Offline-creatable (a
 * branch may sell without connectivity), so it uses a client-generatable
 * UUIDv7 id and soft delete, same profile as Batch/StockMovement/Purchase.
 */
@Schema({ timestamps: true, collection: 'sales' })
export class Sale {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ type: String, ref: 'Customer', index: true })
  customerId?: string;

  @Prop({ required: true, trim: true })
  invoiceNumber: string;

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

  @Prop({ required: true, default: Date.now })
  saleDate: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);

SaleSchema.index({ tenantId: 1, branchId: 1, invoiceNumber: 1 }, { unique: true });
SaleSchema.index({ tenantId: 1, customerId: 1, saleDate: -1 });
SaleSchema.index({ tenantId: 1, 'items.batchAllocations.batchId': 1 });
