import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { StockMovementType } from '@medicore/shared-types';

export type StockMovementDocument = HydratedDocument<StockMovement>;

/**
 * Append-only ledger of every batch quantity change. quantity is always
 * positive; `type` conveys direction. Same offline-creation profile as
 * Batch — UUIDv7 _id, soft delete (corrections are reversing entries, not
 * edits, so deletedAt is present for schema consistency but rarely used).
 */
@Schema({ timestamps: true, collection: 'stock_movements', ...BRANCH_SCOPED })
export class StockMovement {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId: Types.ObjectId;

  @Prop({ required: true, type: String, ref: 'Batch', index: true })
  batchId: string;

  @Prop({ required: true, enum: StockMovementType })
  type: StockMovementType;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ enum: ['PURCHASE', 'SALE', 'TRANSFER', 'ADJUSTMENT'] })
  referenceType?: string;

  @Prop({ type: String })
  referenceId?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  performedBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

StockMovementSchema.index({ tenantId: 1, branchId: 1, productId: 1, createdAt: -1 });
StockMovementSchema.index({ tenantId: 1, batchId: 1 });
