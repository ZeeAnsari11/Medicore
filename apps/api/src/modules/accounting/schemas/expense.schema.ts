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

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, default: Date.now })
  expenseDate: Date;

  @Prop({ required: true, enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Prop({ required: true, type: String, ref: 'Account' })
  paymentAccountId: string;

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
