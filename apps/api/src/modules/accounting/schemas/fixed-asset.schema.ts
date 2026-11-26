import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';

@Schema({ _id: false })
export class AssetDisposal {
  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, min: 0 })
  proceeds: number;

  @Prop({ required: true, enum: ['CASH', 'BANK'] })
  method: 'CASH' | 'BANK';

  /** Positive = gain, negative = loss. */
  @Prop({ required: true })
  gainLoss: number;

  @Prop({ required: true, type: String })
  journalEntryId: string;
}

export const AssetDisposalSchema = SchemaFactory.createForClass(AssetDisposal);

export type FixedAssetDocument = HydratedDocument<FixedAsset>;

/** A long-lived item the business owns, kept at cost until sold: bought Dr Fixed Assets, Cr Cash/Bank. No depreciation. */
@Schema({ timestamps: true, collection: 'fixed_assets', ...BRANCH_SCOPED })
export class FixedAsset {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ type: Number })
  assetSeq?: number;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0 })
  cost: number;

  @Prop({ required: true, default: Date.now })
  purchaseDate: Date;

  @Prop({ required: true, enum: ['CASH', 'BANK', 'EXISTING'] })
  source: 'CASH' | 'BANK' | 'EXISTING';

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, type: String })
  journalEntryId: string;

  @Prop({ required: true, enum: ['ACTIVE', 'DISPOSED'], default: 'ACTIVE' })
  status: 'ACTIVE' | 'DISPOSED';

  @Prop({ type: AssetDisposalSchema })
  disposal?: AssetDisposal;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const FixedAssetSchema = SchemaFactory.createForClass(FixedAsset);
FixedAssetSchema.index({ tenantId: 1, assetSeq: 1 }, { unique: true, partialFilterExpression: { assetSeq: { $type: 'number' } } });
FixedAssetSchema.index({ tenantId: 1, branchId: 1, purchaseDate: -1 });
