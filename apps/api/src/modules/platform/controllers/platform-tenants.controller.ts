import { CrossTenant } from '../../../common/decorators/cross-tenant.decorator';
import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Param } from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TenantsService } from '../../tenants/tenants.service';
import { UsersService } from '../../users/users.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SystemRole, CreatePlatformTenantResponse } from '@medicore/shared-types';
import type { AuthenticatedUser } from '@medicore/shared-types';
import { CreatePlatformTenantDto } from '../dto/create-platform-tenant.dto';
import { UpdateTenantStatusDto } from '../dto/update-tenant-status.dto';
import { UpdateTenantDto } from '../dto/update-tenant.dto';

@CrossTenant()
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  @Roles(SystemRole.SUPER_ADMIN)
  @Get()
  async list() {
    const tenants = await this.tenantsService.findAll();
    return tenants.map((t) => this.tenantsService.toTenantResponse(t));
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Get(':id')
  async getWithAdmin(@Param('id') id: string) {
    const tenant = await this.tenantsService.findById(id);
    if (!tenant) {
      return { tenant: null, adminUser: null };
    }

    const adminUser = await this.usersService.findAdminForTenant(id);

    return {
      tenant: this.tenantsService.toTenantResponse(tenant),
      adminUser: adminUser ? this.usersService.toUserResponse(adminUser) : null,
    };
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePlatformTenantDto): Promise<CreatePlatformTenantResponse> {
    const tenant = await this.tenantsService.create(dto.tenantName);
    const { user, temporaryPassword } = await this.usersService.createTenantAdmin(
      tenant._id.toString(),
      {
        username: dto.adminUsername,
        fullName: dto.adminFullName,
      },
    );

    const settings = await this.platformSettingsService.getSettings();
    if (settings.defaultPlanId) {
      await this.subscriptionsService.createForTenant(
        tenant._id.toString(),
        settings.defaultPlanId.toString(),
        settings.defaultTrialDays,
      );
    }

    return {
      tenant: this.tenantsService.toTenantResponse(tenant),
      adminUser: this.usersService.toUserResponse(user),
      temporaryPassword,
    };
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Post(':id/impersonate')
  @HttpCode(HttpStatus.OK)
  impersonate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.impersonateTenantAdmin(user.userId, id);
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    const tenant = await this.tenantsService.setStatus(id, dto.status);
    return this.tenantsService.toTenantResponse(tenant);
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    const tenant = await this.tenantsService.update(id, dto.name);

    if (dto.username || dto.password || dto.adminFullName) {
      await this.usersService.updateAdminForTenant(id, {
        username: dto.username,
        password: dto.password,
        fullName: dto.adminFullName,
      });
    }

    return this.tenantsService.toTenantResponse(tenant);
  }
}
