import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { UpdatePurchasePaymentDto } from './dto/update-purchase-payment.dto';
import { CreatePurchaseReturnDto } from '../accounting/dto/create-purchase-return.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope, resolveCreateBranch } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @RequirePermission('purchases:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPurchasesQueryDto) {
    const scope = resolveBranchScope(user, query.branchId);
    if (query.page === undefined && query.limit === undefined) {
      const purchases = await this.purchasesService.listForTenant(user.tenantId, scope, query);
      return purchases.map((p) => this.purchasesService.toPurchaseResponse(p));
    }
    const { items, ...meta } = await this.purchasesService.listPageForTenant(user.tenantId, scope, query);
    return { items: items.map((p) => this.purchasesService.toPurchaseResponse(p)), ...meta };
  }

  @RequirePermission('purchases:read', 'purchases:create')
  @Get('last-price')
  async lastPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Query('vendorId') vendorId: string,
    @Query('productIds') productIds?: string | string[],
    @Query('branchId') branchId?: string,
  ) {
    const ids = ([] as string[]).concat(productIds ?? []).flatMap((s) => s.split(',')).filter(Boolean);
    if (!vendorId || ids.length === 0) return [];
    const scope = resolveBranchScope(user, branchId);
    return this.purchasesService.getLastPrices(user.tenantId, scope, vendorId, ids);
  }

  @RequirePermission('purchases:read')
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const purchase = await this.purchasesService.findOne(user.tenantId, scope, id);
    return this.purchasesService.toPurchaseDetailResponse(purchase);
  }

  @RequirePermission('purchases:read')
  @Get(':id/payments')
  async listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    return this.purchasesService.listPayments(user.tenantId, scope, id);
  }

  @RequirePermission('purchases:read')
  @Get(':id/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const doc = await this.purchasesService.buildPurchaseOrderPdf(user.tenantId, scope, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="purchase-order.pdf"');
    doc.pipe(res);
    doc.end();
  }

  @RequirePermission('purchases:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseDto) {
    const scope = resolveCreateBranch(user, dto.branchId);
    return this.purchasesService.createPurchase(user.tenantId, scope, user.userId, dto);
  }

  @RequirePermission('purchases:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const purchase = await this.purchasesService.updatePurchase(user.tenantId, scope, user.userId, id, dto);
    // An edit only succeeds on an unpaid purchase, and the result is unpaid too, so it stays editable.
    return { ...purchase, isEditable: true };
  }

  @RequirePermission('purchases:read')
  @Get(':id/returns')
  async listReturns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    return this.purchasesService.listReturns(user.tenantId, scope, id);
  }

  @RequirePermission('purchases:read')
  @Get(':id/returns/:returnId/pdf')
  async downloadReturnPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('returnId') returnId: string,
    @Res() res: Response,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const doc = await this.purchasesService.buildReturnPdf(user.tenantId, scope, id, returnId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="purchase-return.pdf"');
    doc.pipe(res);
    doc.end();
  }

  @RequirePermission('purchases:return')
  @Post(':id/returns')
  @HttpCode(HttpStatus.CREATED)
  async createReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreatePurchaseReturnDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    return this.purchasesService.createReturn(user.tenantId, scope, user.userId, id, dto);
  }

  @RequirePermission('purchases:record_payment')
  @Patch(':id/payment')
  async updatePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchasePaymentDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const purchase = await this.purchasesService.updatePayment(
      user.tenantId,
      scope,
      user.userId,
      id,
      dto,
    );
    return this.purchasesService.toPurchaseResponse(purchase);
  }

  @RequirePermission('purchases:cancel')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.purchasesService.cancelPurchase(user.tenantId, scope, id, user.userId);
  }
}
