import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProductStatus } from '@medicore/shared-types';

export type ProductDocument = HydratedDocument<Product>;

/**
 * Catalog data — not branch-scoped. Only Batches (Phase 2) are per-branch;
 * a Product itself is org-wide master data.
 */
@Schema({ timestamps: true, collection: 'products' })
export class Product {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  genericName?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Manufacturer', index: true })
  manufacturerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category', index: true })
  categoryId?: Types.ObjectId;

  @Prop({ trim: true })
  barcode?: string;

  @Prop({ required: true, trim: true })
  unit: string;

  @Prop({ trim: true })
  packing?: string;

  @Prop({ required: true, min: 0 })
  purchasePrice: number;

  @Prop({ required: true, min: 0 })
  salePrice: number;

  @Prop({ min: 0 })
  dealerPrice?: number;

  @Prop({ required: true, enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @Prop({ min: 0 })
  minStockLevel?: number;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// A plain `sparse` index on a compound key only excludes a document when
// EVERY indexed field is absent — since tenantId is always present, sparse
// alone never excludes barcode-less products, so a second product with no
// barcode collides with the first. A partial index scoped to "barcode is
// actually a string" is what sparse was meant to express here.
ProductSchema.index(
  { tenantId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);
ProductSchema.index({ tenantId: 1, manufacturerId: 1 });
ProductSchema.index({ tenantId: 1, categoryId: 1 });
ProductSchema.index({ name: 'text', genericName: 'text' });
