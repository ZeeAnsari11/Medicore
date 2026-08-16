import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true, collection: 'categories' })
export class Category {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  // Self-ref, flat hierarchy for v1 — not yet used to nest categories in the UI.
  @Prop({ type: Types.ObjectId, ref: 'Category' })
  parentCategoryId?: Types.ObjectId;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });
