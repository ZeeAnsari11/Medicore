import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';

export type BatchDocument = HydratedDocument<Batch>;

/**
 * Branch-scoped stock lot. Offline-creatable (received via Purchase, which
 * may run at a branch without connectivity) — client-generatable UUIDv7 _id
 * and soft delete, per docs/architecture-decisions.md's offline-sync
 * conventions, instead of a server-assigned ObjectId and hard delete.
 */
@Schema({ timestamps: true, collection: 'batches' })
export class Batch {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  batchNumber: string;

  @Prop({ required: true })
  expiryDate: Date;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  purchasePrice: number;

  @Prop({ min: 0 })
  sellingPrice?: number;

  @Prop({ required: true, default: Date.now })
  receivedAt: Date;

  // Nullable: no Purchase exists yet for opening-stock / manual-adjustment batches.
  @Prop({ type: String, default: null })
  purchaseId: string | null;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);

BatchSchema.index({ tenantId: 1, branchId: 1, productId: 1, batchNumber: 1 }, { unique: true });
BatchSchema.index({ tenantId: 1, branchId: 1, productId: 1, expiryDate: 1 });
BatchSchema.index({ tenantId: 1, expiryDate: 1 });
