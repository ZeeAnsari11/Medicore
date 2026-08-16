import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ManufacturerDocument = HydratedDocument<Manufacturer>;

@Schema({ timestamps: true, collection: 'manufacturers' })
export class Manufacturer {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true, lowercase: true })
  contactEmail?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const ManufacturerSchema = SchemaFactory.createForClass(Manufacturer);

ManufacturerSchema.index({ tenantId: 1, name: 1 }, { unique: true });
