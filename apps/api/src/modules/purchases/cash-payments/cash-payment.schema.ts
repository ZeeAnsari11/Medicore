import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { PaymentMethod } from '@medicore/shared-types';

@Schema({ _id: false })
export class CashPaymentRow {
  /** Stable id of this entry within its transaction; edits are matched on it. */
  @Prop({ type: String })
  entryId?: string;

  @Prop({ required: true, type: String })
  invoiceId: string;

  @Prop({ required: true, type: String })
  invoiceNumber: string;

  @Prop({ required: true, type: String })
  vendorId: string;

  @Prop({ required: true, type: String })
  vendorName: string;

  @Prop({ required: true, type: String })
  paymentId: string;

  /** The ledger posting this entry's payment created, edited in place by a transaction edit. */
  @Prop({ type: String })
  journalEntryId?: string;

  @Prop({ type: Date })
  date?: Date;

  @Prop({ required: true, min: 0 })
  amount: number;

  /** Written off with this entry so the invoice is settled (0 / absent when none). */
  @Prop({ type: Number, min: 0 })
  difference?: number;

  @Prop({ required: true, enum: PaymentMethod })
  method: PaymentMethod;

  @Prop({ trim: true })
  reference?: string;

}

export const CashPaymentRowSchema = SchemaFactory.createForClass(CashPaymentRow);

export type CashPaymentDocument = HydratedDocument<CashPayment>;

/** One saved bulk purchase receipt sheet; each row maps to a normal vendor Payment on its purchase invoice. */
@Schema({ timestamps: true, collection: 'cash_payments', ...BRANCH_SCOPED })
export class CashPayment {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;

  /** Client-generated; makes a retried or double-clicked save a no-op. */
  @Prop({ required: true, type: String })
  batchId: string;

  @Prop({ required: true, type: String })
  voucherNumber: string;

  /** Per-tenant T-0001 number; absent on receipts saved before transactions existed until migrated. */
  @Prop({ type: String })
  transactionNumber?: string;

  /** Bumped by every edit; a stale expectedVersion is rejected with 409. */
  @Prop({ type: Number, default: 1 })
  version: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, enum: PaymentMethod })
  method: PaymentMethod;

  @Prop({ type: [CashPaymentRowSchema], required: true })
  rows: CashPaymentRow[];

  /** Cash received. */
  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ type: Number, min: 0 })
  differenceTotal?: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const CashPaymentSchema = SchemaFactory.createForClass(CashPayment);

CashPaymentSchema.index({ tenantId: 1, branchId: 1, batchId: 1 }, { unique: true });
CashPaymentSchema.index({ tenantId: 1, branchId: 1, voucherNumber: 1 }, { unique: true });
// Finds the receipt a payment came from (ledger and Payments page).
CashPaymentSchema.index({ tenantId: 1, 'rows.paymentId': 1 });
CashPaymentSchema.index(
  { tenantId: 1, transactionNumber: 1 },
  { unique: true, partialFilterExpression: { transactionNumber: { $type: 'string' } } },
);
