import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PlatformSettingsDocument = HydratedDocument<PlatformSettings>;

@Schema({ timestamps: true, collection: 'platform_settings' })
export class PlatformSettings {
  @Prop({ required: true, trim: true, default: 'Medicore' })
  platformName: string;

  @Prop({ type: String, default: null })
  logoUrl: string | null;

  @Prop({ required: true, trim: true })
  supportEmail: string;

  @Prop({ required: true, min: 0, default: 14 })
  defaultTrialDays: number;

  @Prop({ type: Types.ObjectId, ref: 'Plan', default: null })
  defaultPlanId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  contactPhone: string | null;
}

export const PlatformSettingsSchema = SchemaFactory.createForClass(PlatformSettings);
