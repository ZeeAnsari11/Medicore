import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';

export type TerritoryDocument = HydratedDocument<Territory>;

/** Branch-owned, always the same branch as its city. */
@Schema({ timestamps: true, collection: 'territories', ...BRANCH_SCOPED })
export class Territory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'City' })
  cityId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  /** Lower-cased name, unique within its city. */
  @Prop({ required: true })
  nameKey: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const TerritorySchema = SchemaFactory.createForClass(Territory);

TerritorySchema.index({ tenantId: 1, branchId: 1, cityId: 1, nameKey: 1 }, { unique: true });
