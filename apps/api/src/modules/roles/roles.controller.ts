import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRoleStatusDto } from './dto/update-role-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AVAILABLE_MODULES } from '@medicore/shared-types';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('modules/available')
  getAvailableModules() {
    return AVAILABLE_MODULES;
  }

  @RequirePermission('roles:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.rolesService.listForTenant(user.tenantId);
  }

  @RequirePermission('roles:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(user.tenantId, dto);
  }

  @RequirePermission('roles:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(user.tenantId, id, dto);
  }

  @RequirePermission('roles:update')
  @Patch(':id/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleStatusDto,
  ) {
    return this.rolesService.setStatus(user.tenantId, id, dto.isActive);
  }

  @RequirePermission('roles:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.rolesService.deleteRole(user.tenantId, id);
  }
}
