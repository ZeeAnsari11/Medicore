import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { FixedAssetsService } from './fixed-assets.service';
import { CreateFixedAssetDto, DisposeFixedAssetDto } from './dto/fixed-asset.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope, resolveCreateBranch } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/assets')
export class FixedAssetsController {
  constructor(private readonly assetsService: FixedAssetsService) {}

  @RequirePermission('acc_assets:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const assets = await this.assetsService.list(user.tenantId, resolveBranchScope(user, branchId));
    return assets.map((a) => this.assetsService.toResponse(a));
  }

  @RequirePermission('acc_assets:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFixedAssetDto) {
    const asset = await this.assetsService.create(user.tenantId, resolveCreateBranch(user, dto.branchId), user.userId, dto);
    return this.assetsService.toResponse(asset);
  }

  @RequirePermission('acc_assets:create')
  @Post(':id/dispose')
  @HttpCode(HttpStatus.OK)
  async dispose(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DisposeFixedAssetDto) {
    return this.assetsService.toResponse(await this.assetsService.dispose(user.tenantId, id, user.userId, dto));
  }
}
