import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';

@Schema({ _id: false })
export class CashPaymentChangeState {
  @Prop({ required: true })
  amount: number;

  /** Written off with this entry; absent when there was none (and on history from before it was tracked). */
  @Prop()
  difference?: number;

  @Prop({ type: Date })
  date?: Date;
}

const CashPaymentChangeStateSchema = SchemaFactory.createForClass(CashPaymentChangeState);

@Schema({ _id: false })
export class CashPaymentChange {
  @Prop({ required: true, type: String })
  entryId: string;

  @Prop({ required: true, enum: ['ADDED', 'CHANGED', 'REMOVED'] })
  op: 'ADDED' | 'CHANGED' | 'REMOVED';

  @Prop({ required: true, type: String })
  invoiceId: string;

  @Prop({ required: true, type: String })
  invoiceNumber: string;

  @Prop({ type: CashPaymentChangeStateSchema, default: null })
  before: CashPaymentChangeState | null;

  @Prop({ type: CashPaymentChangeStateSchema, default: null })
  after: CashPaymentChangeState | null;
}

const CashPaymentChangeSchema = SchemaFactory.createForClass(CashPaymentChange);

export type CashPaymentHistoryDocument = HydratedDocument<CashPaymentHistory>;

/** One row per successful edit of a bulk purchase receipt transaction: who, when, and before/after of every changed entry. */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'cash_payment_history',
  ...BRANCH_SCOPED,
})
export class CashPaymentHistory {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: String })
  paymentSheetId: string;

  @Prop({ required: true, type: String })
  transactionNumber: string;

  /** The transaction's version after this edit. */
  @Prop({ required: true })
  version: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  actorId: Types.ObjectId;

  @Prop({ type: [CashPaymentChangeSchema], required: true })
  changes: CashPaymentChange[];
}

export const CashPaymentHistorySchema = SchemaFactory.createForClass(CashPaymentHistory);

CashPaymentHistorySchema.index({ tenantId: 1, paymentSheetId: 1, createdAt: 1 });
