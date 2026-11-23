import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';

export type ExpenseCategoryDocument = HydratedDocument<ExpenseCategory>;

/**
 * Two-level expense category. A main category (`parentId` null) is backed by an EXPENSE account (`accountId`), so
 * the Profit & Loss keeps one line per main category; a sub-category is only a label on the expense. A category
 * belongs to one branch and its sub-categories inherit it; the same name in two branches shares one account, so
 * the Profit & Loss still shows one line for it.
 */
@Schema({ timestamps: true, collection: 'expense_categories' })
export class ExpenseCategory {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  /**
   * Branch the category belongs to (sub-categories: their category's). Categories made before branches mattered have
   * none until the next load moves them to the main branch.
   */
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  /** Lower-cased name, so "Gas" and "gas" collide under the unique index. */
  @Prop({ required: true })
  nameLower: string;

  /** Null for a main category; the main category's id for a sub-category. */
  @Prop({ type: String, default: null })
  parentId: string | null;

  /** Main categories only: the EXPENSE account its expenses post to. */
  @Prop({ type: String, ref: 'Account' })
  accountId?: string;

  /** The category every branch gets automatically (Difference > Sales Difference); it can't be renamed, deactivated or deleted. */
  @Prop({ default: false })
  isDefault?: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ExpenseCategorySchema = SchemaFactory.createForClass(ExpenseCategory);

ExpenseCategorySchema.index({ tenantId: 1, branchId: 1, parentId: 1, nameLower: 1 }, { unique: true });
// Same partial-index approach as Account.systemKey: only mains have an accountId.
ExpenseCategorySchema.index(
  { tenantId: 1, branchId: 1, accountId: 1 },
  { unique: true, partialFilterExpression: { accountId: { $type: 'string' } } },
);
