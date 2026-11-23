import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { PaymentMethod } from '@medicore/shared-types';

export type ExpenseDocument = HydratedDocument<Expense>;

@Schema({ timestamps: true, collection: 'expenses', ...BRANCH_SCOPED })
export class Expense {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: String, ref: 'Account' })
  expenseAccountId: string;

  /** Main category / sub-category it was recorded under; absent on expenses from before categories existed. */
  @Prop({ type: String, ref: 'ExpenseCategory' })
  categoryId?: string;

  @Prop({ type: String, ref: 'ExpenseCategory' })
  subCategoryId?: string;

  /** Running number per tenant (1, 2, 3 ...), like a payment's: what the Expenses list shows as the Expense ID. */
  @Prop({ type: Number })
  expenseSeq?: number;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, default: Date.now })
  expenseDate: Date;

  /** Absent on a CASH_RECEIPT expense: nothing was paid out, the money was written off against a customer's invoice. */
  @Prop({ enum: PaymentMethod })
  paymentMethod?: PaymentMethod;

  @Prop({ type: String, ref: 'Account' })
  paymentAccountId?: string;

  /** `CASH_RECEIPT`: the difference written off on a cash receipt; `sourceId` is that receipt's payment. */
  @Prop({ type: String })
  sourceType?: string;

  @Prop({ type: String })
  sourceId?: string;

  @Prop({ type: String })
  invoiceId?: string;

  @Prop({ type: String })
  invoiceNumber?: string;

  @Prop({ type: String, ref: 'Vendor' })
  vendorId?: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ trim: true })
  reference?: string;

  @Prop({ required: true, type: String })
  journalEntryId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

ExpenseSchema.index({ tenantId: 1, branchId: 1, expenseDate: -1 });
ExpenseSchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 }, { sparse: true });
ExpenseSchema.index({ tenantId: 1, expenseSeq: 1 }, { unique: true, partialFilterExpression: { expenseSeq: { $type: 'number' } } });
