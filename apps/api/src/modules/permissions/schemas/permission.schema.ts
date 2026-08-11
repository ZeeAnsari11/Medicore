import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PermissionDocument = HydratedDocument<Permission>;

@Schema({ timestamps: true, collection: 'permissions' })
export class Permission {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', default: null, index: true })
  tenantId: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, trim: true, index: true })
  module: string;

  @Prop({ required: true, default: false })
  isSystem: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);

// Uniqueness scoped correctly for a nullable tenantId:
// For system-level permissions (tenantId: null)
PermissionSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { tenantId: null } });

// For tenant-level permissions
PermissionSchema.index({ tenantId: 1, key: 1 }, { unique: true, partialFilterExpression: { tenantId: { $type: 'objectId' } } });
