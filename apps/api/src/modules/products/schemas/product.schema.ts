import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProductStatus } from '@medicore/shared-types';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';

export type ProductDocument = HydratedDocument<Product>;

/** Branch-owned catalog data: each branch keeps its own products (and its own barcodes). */
@Schema({ timestamps: true, collection: 'products', ...BRANCH_SCOPED })
export class Product {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

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

  /** Trade price: the default price we sell at. */
  @Prop({ required: true, min: 0 })
  tp: number;

  /** Cost price: what we purchase at, and the floor for sale prices. */
  @Prop({ required: true, min: 0 })
  cp: number;

  /** Retail price printed on the pack; reference only. */
  @Prop({ min: 0 })
  rp?: number;

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
  { tenantId: 1, branchId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);
ProductSchema.index({ tenantId: 1, branchId: 1, manufacturerId: 1 });
ProductSchema.index({ tenantId: 1, categoryId: 1 });
