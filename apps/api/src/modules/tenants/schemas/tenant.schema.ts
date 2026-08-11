import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TenantStatus } from '@medicore/shared-types';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ timestamps: true, collection: 'tenants' })
export class Tenant {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  })
  slug: string;

  @Prop({ required: true, enum: TenantStatus, default: TenantStatus.TRIAL })
  status: TenantStatus;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
