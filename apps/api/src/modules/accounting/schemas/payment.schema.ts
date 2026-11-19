import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { InvoiceType, PartyType, PaymentMethod } from '@medicore/shared-types';

@Schema({ _id: false })
export class PaymentAllocation {
  @Prop({ required: true, enum: InvoiceType })
  invoiceType: InvoiceType;

  @Prop({ required: true, type: String })
  invoiceId: string;

  @Prop({ required: true, min: 0 })
  amount: number;
}

export const PaymentAllocationSchema = SchemaFactory.createForClass(PaymentAllocation);

export type PaymentDocument = HydratedDocument<Payment>;

/**
 * One real cash/bank movement. `allocations` grows over time: populated at
 * creation for immediate payment against known invoices, and/or appended
 * later via the allocate action when a pre-existing advance (amount not yet
 * fully allocated) gets matched to a new invoice. `amount - Σallocations`
 * is always the currently-unapplied advance/credit remainder.
 */
@Schema({ timestamps: true, collection: 'payments', ...BRANCH_SCOPED })
export class Payment {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, enum: PartyType })
  partyType: PartyType;

  @Prop({ required: true, type: String, index: true })
  partyId: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, enum: PaymentMethod })
  method: PaymentMethod;

  @Prop({ required: true, type: String, ref: 'Account' })
  accountId: string;

  @Prop({ required: true, default: Date.now })
  paymentDate: Date;

  @Prop({ trim: true })
  reference?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: [PaymentAllocationSchema], required: true, default: [] })
  allocations: PaymentAllocation[];

  @Prop({ required: true, type: String })
  journalEntryId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  /** Inherited from the sale(s) it pays, when they all share one Order Booker. */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  orderBookerId?: Types.ObjectId;

  @Prop({ trim: true })
  orderBookerName?: string;

  /** Per-tenant running number (1, 2, 3, ...) shown as the payment id; absent on payments saved before numbering. */
  @Prop({ type: Number })
  paymentSeq?: number;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ tenantId: 1, branchId: 1, paymentDate: -1 });
PaymentSchema.index({ tenantId: 1, partyType: 1, partyId: 1, paymentDate: -1 });
PaymentSchema.index({ tenantId: 1, 'allocations.invoiceId': 1 });
PaymentSchema.index({ tenantId: 1, paymentSeq: 1 }, { unique: true, partialFilterExpression: { paymentSeq: { $type: 'number' } } });
