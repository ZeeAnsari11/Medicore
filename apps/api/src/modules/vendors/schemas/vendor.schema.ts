import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VendorDocument = HydratedDocument<Vendor>;

/**
 * Vendor/distributor — the company the tenant buys from. Deliberately has no
 * raw `manufacturer` field: Manufacturer and Vendor are distinct entities
 * (see docs/domain-model.md). "Filterable by manufacturer" is served by a
 * query-time join through VendorProduct -> Product.manufacturerId instead.
 */
@Schema({ timestamps: true, collection: 'vendors' })
export class Vendor {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  company: string;

  @Prop({ trim: true })
  distributorType?: string;

  @Prop({ trim: true })
  contactName?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  @Prop({ trim: true, lowercase: true })
  contactEmail?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const VendorSchema = SchemaFactory.createForClass(Vendor);

VendorSchema.index({ tenantId: 1, company: 1 }, { unique: true });
