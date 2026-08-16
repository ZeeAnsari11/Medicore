import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VendorProductDocument = HydratedDocument<VendorProduct>;

/**
 * Join between Vendor and Product carrying vendor-specific pricing. The same
 * Product may be sold by several vendors, each at a different price — this
 * is how that's represented, instead of duplicating Product per vendor.
 */
@Schema({ timestamps: true, collection: 'vendor_products' })
export class VendorProduct {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Vendor', index: true })
  vendorId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId: Types.ObjectId;

  @Prop({ trim: true })
  vendorSku?: string;

  @Prop({ required: true, min: 0 })
  purchasePrice: number;

  @Prop({ required: true, default: false })
  isPreferred: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const VendorProductSchema = SchemaFactory.createForClass(VendorProduct);

VendorProductSchema.index({ tenantId: 1, vendorId: 1, productId: 1 }, { unique: true });
VendorProductSchema.index({ tenantId: 1, productId: 1 });
