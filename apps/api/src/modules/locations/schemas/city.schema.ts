import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';

export type CityDocument = HydratedDocument<City>;

/** Branch-owned like customers: each branch keeps its own list (the same city name may exist in two branches). */
@Schema({ timestamps: true, collection: 'cities', ...BRANCH_SCOPED })
export class City {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  /** Lower-cased name: "Kasur" and "kasur" are the same city. */
  @Prop({ required: true })
  nameKey: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const CitySchema = SchemaFactory.createForClass(City);

CitySchema.index({ tenantId: 1, branchId: 1, nameKey: 1 }, { unique: true });
