import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Param } from '@nestjs/common';
import { TenantsService } from '../../tenants/tenants.service';
import { UsersService } from '../../users/users.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SystemRole, CreatePlatformTenantResponse } from '@medicore/shared-types';
import { CreatePlatformTenantDto } from '../dto/create-platform-tenant.dto';
import { UpdateTenantStatusDto } from '../dto/update-tenant-status.dto';

@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
  ) {}

  @Roles(SystemRole.SUPER_ADMIN)
  @Get()
  async list() {
    const tenants = await this.tenantsService.findAll();
    return tenants.map((t) => this.tenantsService.toTenantResponse(t));
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePlatformTenantDto): Promise<CreatePlatformTenantResponse> {
    const tenant = await this.tenantsService.create(dto.tenantName);
    const { user, temporaryPassword } = await this.usersService.createTenantAdmin(
      tenant._id.toString(),
      {
        email: dto.adminEmail,
        fullName: dto.adminFullName,
      },
    );
    return {
      tenant: this.tenantsService.toTenantResponse(tenant),
      adminUser: this.usersService.toUserResponse(user),
      temporaryPassword,
    };
  }

  @Roles(SystemRole.SUPER_ADMIN)
  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    const tenant = await this.tenantsService.setStatus(id, dto.status);
    return this.tenantsService.toTenantResponse(tenant);
  }
}
