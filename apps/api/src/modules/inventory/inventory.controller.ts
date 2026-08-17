import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CreateBatchAdjustmentDto } from './dto/create-batch-adjustment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly batchesService: BatchesService) {}

  @RequirePermission('inventory:read')
  @Get()
  async listRollup(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    return this.batchesService.listRollup(user.tenantId, scope, search);
  }

  @RequirePermission('inventory:read')
  @Get('expiring')
  async listExpiring(
    @CurrentUser() user: AuthenticatedUser,
    @Query('withinDays') withinDays?: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const days = withinDays ? parseInt(withinDays, 10) : 30;
    const batches = await this.batchesService.listExpiring(user.tenantId, scope, days);
    return batches.map((b) => this.batchesService.toBatchResponse(b));
  }

  @RequirePermission('inventory:read')
  @Get(':productId/batches')
  async listBatchesForProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const batches = await this.batchesService.listBatchesForProduct(
      user.tenantId,
      scope,
      productId,
    );
    return batches.map((b) => this.batchesService.toBatchResponse(b));
  }

  @RequirePermission('inventory:adjust')
  @Post('adjustments')
  async createAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBatchAdjustmentDto,
  ) {
    const scope = resolveBranchScope(user, dto.branchId);
    if (!scope) {
      throw new BadRequestException('branchId is required for admins performing an adjustment');
    }
    return this.batchesService.applyAdjustment(user.tenantId, scope, user.userId, dto);
  }
}
