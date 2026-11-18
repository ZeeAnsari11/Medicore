import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';

@Schema({ _id: false })
export class CashReceiptChangeState {
  @Prop({ required: true })
  amount: number;

  @Prop({ type: Date })
  date?: Date;
}

const CashReceiptChangeStateSchema = SchemaFactory.createForClass(CashReceiptChangeState);

@Schema({ _id: false })
export class CashReceiptChange {
  @Prop({ required: true, type: String })
  entryId: string;

  @Prop({ required: true, enum: ['ADDED', 'CHANGED', 'REMOVED'] })
  op: 'ADDED' | 'CHANGED' | 'REMOVED';

  @Prop({ required: true, type: String })
  invoiceId: string;

  @Prop({ required: true, type: String })
  invoiceNumber: string;

  @Prop({ type: CashReceiptChangeStateSchema, default: null })
  before: CashReceiptChangeState | null;

  @Prop({ type: CashReceiptChangeStateSchema, default: null })
  after: CashReceiptChangeState | null;
}

const CashReceiptChangeSchema = SchemaFactory.createForClass(CashReceiptChange);

export type CashReceiptHistoryDocument = HydratedDocument<CashReceiptHistory>;

/** One row per successful edit of a cash-receipt transaction: who, when, and before/after of every changed entry. */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'cash_receipt_history',
  ...BRANCH_SCOPED,
})
export class CashReceiptHistory {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: String })
  receiptId: string;

  @Prop({ required: true, type: String })
  transactionNumber: string;

  /** The transaction's version after this edit. */
  @Prop({ required: true })
  version: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  actorId: Types.ObjectId;

  @Prop({ type: [CashReceiptChangeSchema], required: true })
  changes: CashReceiptChange[];
}

export const CashReceiptHistorySchema = SchemaFactory.createForClass(CashReceiptHistory);

CashReceiptHistorySchema.index({ tenantId: 1, receiptId: 1, createdAt: 1 });
