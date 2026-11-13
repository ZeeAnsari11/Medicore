import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '@medicore/shared-types';
import { resolveBranchScope, resolveCreateBranch } from '../../common/branch/branch-scope.util';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { StockTransfersService } from './stock-transfers.service';

@Controller('inventory/transfers')
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @RequirePermission('inventory:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    return this.transfers.list(user.tenantId, resolveBranchScope(user, branchId));
  }

  @RequirePermission('inventory:adjust')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStockTransferDto) {
    const from = resolveCreateBranch(user, dto.fromBranchId);
    return this.transfers.create(user.tenantId, from, user.userId, dto);
  }

  @RequirePermission('inventory:read')
  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfers.get(user.tenantId, resolveBranchScope(user), id);
  }

  @RequirePermission('inventory:read')
  @Get(':id/pdf')
  async pdf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const transfer = await this.transfers.get(user.tenantId, resolveBranchScope(user), id);
    const buffer = await this.transfers.buildSlip(transfer);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${transfer.transferNumber}.pdf"`);
    res.send(buffer);
  }
}
