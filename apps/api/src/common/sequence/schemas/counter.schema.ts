import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CounterDocument = HydratedDocument<Counter>;

/**
 * Backing store for SequenceService's atomic per-(tenant, branch, type) counters
 * — e.g. Purchase.purchaseNumber, Sale.invoiceNumber. Replaces the pre-save
 * regex-scan numbering pattern (race-unsafe under concurrency) with a single
 * atomic findOneAndUpdate($inc) per number issued.
 */
@Schema({ timestamps: true, collection: 'counters' })
export class Counter {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', default: null })
  branchId: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, default: 0 })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);

CounterSchema.index({ tenantId: 1, branchId: 1, type: 1 }, { unique: true });
