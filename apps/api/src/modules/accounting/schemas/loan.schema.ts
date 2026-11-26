import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';

@Schema({ _id: false })
export class LoanRepaymentEntry {
  @Prop({ type: String, default: () => uuidv7() })
  id: string;

  @Prop({ required: true, default: Date.now })
  date: Date;

  @Prop({ required: true, min: 0 })
  principal: number;

  @Prop({ required: true, min: 0, default: 0 })
  interest: number;

  @Prop({ required: true, enum: ['CASH', 'BANK'] })
  method: 'CASH' | 'BANK';

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, type: String })
  journalEntryId: string;
}

export const LoanRepaymentEntrySchema = SchemaFactory.createForClass(LoanRepaymentEntry);

export type LoanDocument = HydratedDocument<Loan>;

/** Money borrowed. The entries it posts: Dr Cash/Bank, Cr Loans Payable; each repayment Dr Loans Payable + Interest Expense, Cr Cash/Bank. */
@Schema({ timestamps: true, collection: 'loans', ...BRANCH_SCOPED })
export class Loan {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ type: Number })
  loanSeq?: number;

  @Prop({ required: true, trim: true })
  lender: string;

  @Prop({ required: true, min: 0 })
  principal: number;

  @Prop({ required: true, default: Date.now })
  loanDate: Date;

  @Prop({ required: true, enum: ['CASH', 'BANK'] })
  method: 'CASH' | 'BANK';

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, type: String })
  journalEntryId: string;

  @Prop({ type: [LoanRepaymentEntrySchema], default: [] })
  repayments: LoanRepaymentEntry[];

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);
LoanSchema.index({ tenantId: 1, loanSeq: 1 }, { unique: true, partialFilterExpression: { loanSeq: { $type: 'number' } } });
LoanSchema.index({ tenantId: 1, branchId: 1, loanDate: -1 });
