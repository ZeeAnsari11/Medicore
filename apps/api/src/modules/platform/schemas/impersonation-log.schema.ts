import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ImpersonationLogDocument = HydratedDocument<ImpersonationLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'impersonation_logs' })
export class ImpersonationLog {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  superAdminId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  targetUserId: Types.ObjectId;

  /** Token expiry; a session past this (or with `endedAt` set) is rejected. */
  @Prop({ required: true, type: Date })
  expiresAt: Date;

  @Prop({ type: Date })
  endedAt?: Date;

  @Prop({ type: String, enum: ['EXIT'] })
  endReason?: 'EXIT';
}

export const ImpersonationLogSchema = SchemaFactory.createForClass(ImpersonationLog);
