import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SystemRole } from '@medicore/shared-types';
import { UpdatePlatformSettingsDto } from '../../platform-settings/dto/update-platform-settings.dto';

@Controller('platform/settings')
export class PlatformSettingsController {
  constructor(private readonly platformSettingsService: PlatformSettingsService) {}

  @Roles(SystemRole.SUPER_ADMIN)
  @Get()
  async get() {
    const settings = await this.platformSettingsService.getSettings();
    return this.platformSettingsService.toSettingsResponse(settings);
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Patch()
  async update(@Body() dto: UpdatePlatformSettingsDto) {
    const settings = await this.platformSettingsService.updateSettings(dto);
    return this.platformSettingsService.toSettingsResponse(settings);
  }
}
