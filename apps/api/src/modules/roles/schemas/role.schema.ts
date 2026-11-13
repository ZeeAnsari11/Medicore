import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [String], default: [] })
  allowedModules: string[];

  /** 2 = saved through the module matrix. Lower/absent = legacy keys, expanded at resolve time. */
  @Prop({ default: 1 })
  permissionsVersion: number;

  @Prop({ required: true, default: true })
  isActive: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
