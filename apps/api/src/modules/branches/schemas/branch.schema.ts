import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BranchDocument = HydratedDocument<Branch>;

@Schema({ timestamps: true, collection: 'branches' })
export class Branch {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, uppercase: true })
  code: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ required: true, default: false })
  isMain: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const BranchSchema = SchemaFactory.createForClass(Branch);

BranchSchema.index({ tenantId: 1, code: 1 }, { unique: true });
