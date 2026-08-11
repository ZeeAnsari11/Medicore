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
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { UpdatePermissionStatusDto } from './dto/update-permission-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @RequirePermission('permissions:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.permissionsService.findVisibleToTenant(user.tenantId);
  }

  @RequirePermission('permissions:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePermissionDto) {
    return this.permissionsService.createForTenant(user.tenantId, dto);
  }

  @RequirePermission('permissions:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.updateForTenant(user.tenantId, id, dto);
  }

  @RequirePermission('permissions:update')
  @Patch(':id/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionStatusDto,
  ) {
    return this.permissionsService.setStatus(user.tenantId, id, dto.isActive);
  }

  @RequirePermission('permissions:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.permissionsService.deleteForTenant(user.tenantId, id);
  }
}
