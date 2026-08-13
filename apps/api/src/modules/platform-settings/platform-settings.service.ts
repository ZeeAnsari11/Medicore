import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlatformSettings, PlatformSettingsDocument } from './schemas/platform-settings.schema';
import type { PlatformSettings as PlatformSettingsType } from '@medicore/shared-types';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

const DEFAULT_SUPPORT_EMAIL = 'support@medicore.local';

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectModel(PlatformSettings.name)
    private readonly settingsModel: Model<PlatformSettingsDocument>,
  ) {}

  async getSettings() {
    const existing = await this.settingsModel.findOne();
    if (existing) {
      return existing;
    }

    return this.settingsModel.create({
      platformName: 'Medicore',
      supportEmail: DEFAULT_SUPPORT_EMAIL,
      defaultTrialDays: 14,
    });
  }

  async updateSettings(dto: UpdatePlatformSettingsDto) {
    const settings = await this.getSettings();

    if (dto.platformName !== undefined) settings.platformName = dto.platformName;
    if (dto.logoUrl !== undefined) settings.logoUrl = dto.logoUrl;
    if (dto.supportEmail !== undefined) settings.supportEmail = dto.supportEmail;
    if (dto.defaultTrialDays !== undefined) settings.defaultTrialDays = dto.defaultTrialDays;
    if (dto.defaultPlanId !== undefined) {
      settings.defaultPlanId = dto.defaultPlanId ? new Types.ObjectId(dto.defaultPlanId) : null;
    }
    if (dto.contactPhone !== undefined) settings.contactPhone = dto.contactPhone;

    return settings.save();
  }

  toSettingsResponse(settings: PlatformSettingsDocument): PlatformSettingsType {
    const obj = settings.toObject() as any;
    return {
      id: obj._id.toString(),
      platformName: obj.platformName,
      logoUrl: obj.logoUrl,
      supportEmail: obj.supportEmail,
      defaultTrialDays: obj.defaultTrialDays,
      defaultPlanId: obj.defaultPlanId ? obj.defaultPlanId.toString() : null,
      contactPhone: obj.contactPhone,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
