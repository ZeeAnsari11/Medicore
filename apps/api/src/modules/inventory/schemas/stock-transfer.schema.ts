import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';

export type StockTransferDocument = HydratedDocument<StockTransfer>;

@Schema({ _id: false })
export class StockTransferLine {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId: Types.ObjectId;

  @Prop({ required: true, type: String })
  productName: string;

  /** Batch in the source branch. */
  @Prop({ required: true, type: String })
  batchId: string;

  @Prop({ required: true, trim: true })
  batchNumber: string;

  @Prop({ required: true })
  expiryDate: Date;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitCost: number;
}

/**
 * Moves stock between two branches of a tenant. Owned by the SOURCE branch (`branchId`), so a branch
 * user sees the transfers they send; `toBranchId` is the destination. No accounting impact.
 */
@Schema({ timestamps: true, collection: 'stock_transfers', ...BRANCH_SCOPED })
export class StockTransfer {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  /** Source branch. */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch' })
  toBranchId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  transferNumber: string;

  @Prop({ type: [SchemaFactory.createForClass(StockTransferLine)], default: [] })
  lines: StockTransferLine[];

  @Prop({ trim: true })
  note?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const StockTransferSchema = SchemaFactory.createForClass(StockTransfer);

StockTransferSchema.index({ tenantId: 1, branchId: 1, transferNumber: 1 }, { unique: true });
StockTransferSchema.index({ tenantId: 1, toBranchId: 1, createdAt: -1 });
