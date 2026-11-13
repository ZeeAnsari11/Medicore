import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';

export type ProductPriceHistoryDocument = HydratedDocument<ProductPriceHistory>;

/** Audit trail of vendor purchase-price changes made by a purchase. */
@Schema({ timestamps: true, collection: 'product_price_history', ...BRANCH_SCOPED })
export class ProductPriceHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Vendor' })
  vendorId: Types.ObjectId;

  @Prop({ required: true })
  oldPurchasePrice: number;

  @Prop({ required: true })
  newPurchasePrice: number;

  @Prop()
  oldSalePrice?: number;

  @Prop()
  newSalePrice?: number;

  @Prop({ required: true, type: String })
  purchaseId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  changedBy: Types.ObjectId;
}

export const ProductPriceHistorySchema = SchemaFactory.createForClass(ProductPriceHistory);
