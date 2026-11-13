import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PermissionAuditDocument = HydratedDocument<PermissionAudit>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'permission_audit' })
export class PermissionAudit {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  actorId: Types.ObjectId;

  @Prop({ required: true, enum: ['user', 'role'] })
  targetType: 'user' | 'role';

  @Prop({ required: true, type: Types.ObjectId })
  targetId: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  oldPermissions: string[];

  @Prop({ type: [String], default: [] })
  newPermissions: string[];
}

export const PermissionAuditSchema = SchemaFactory.createForClass(PermissionAudit);
PermissionAuditSchema.index({ tenantId: 1, targetId: 1, createdAt: -1 });
