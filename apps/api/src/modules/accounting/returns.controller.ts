import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchFromDocument } from '../../common/branch/branch-scope.util';
import { resolveOwnSalesScope } from '../../common/branch/order-booker-scope.util';
import { PermissionResolverService } from '../roles/permission-resolver.service';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/returns/sale')
export class SaleReturnsController {
  constructor(
    private readonly returnsService: ReturnsService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  private async ownScope(user: AuthenticatedUser): Promise<string | null> {
    return resolveOwnSalesScope(user, await this.permissionResolver.has(user, 'sales:view_all'));
  }

  private async assertOwnSale(user: AuthenticatedUser, saleId: string): Promise<void> {
    const owner = await this.ownScope(user);
    if (owner) await this.returnsService.assertSaleOwnedBy(user.tenantId, saleId, owner);
  }

  @RequirePermission('acc_returns:read')
  @Get('returnable')
  async returnable(@CurrentUser() user: AuthenticatedUser, @Query('saleId') saleId: string) {
    await this.assertOwnSale(user, saleId);
    return this.returnsService.getReturnableSaleItems(user.tenantId, saleId);
  }

  @RequirePermission('acc_returns:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('saleId') saleId?: string) {
    const returns = await this.returnsService.listSaleReturns(user.tenantId, saleId, await this.ownScope(user));
    return this.returnsService.toSaleReturnResponses(user.tenantId, returns);
  }

  @RequirePermission('acc_returns:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSaleReturnDto,
  ) {
    await this.assertOwnSale(user, dto.saleId);
    const original = await this.returnsService.originalBranchId(user.tenantId, 'sale', dto.saleId);
    const scope = resolveBranchFromDocument(user, original, 'Sale not found', dto.branchId);
    const ret = await this.returnsService.createSaleReturn(user.tenantId, scope, user.userId, dto);
    return this.returnsService.toSaleReturnResponse(ret);
  }
}

@Controller('accounting/returns/purchase')
export class PurchaseReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @RequirePermission('acc_returns:read')
  @Get('returnable')
  async returnable(
    @CurrentUser() user: AuthenticatedUser,
    @Query('purchaseId') purchaseId: string,
  ) {
    return this.returnsService.getReturnablePurchaseItems(user.tenantId, purchaseId);
  }

  @RequirePermission('acc_returns:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('purchaseId') purchaseId?: string) {
    const returns = await this.returnsService.listPurchaseReturns(user.tenantId, purchaseId);
    return returns.map((r) => this.returnsService.toPurchaseReturnResponse(r));
  }

  @RequirePermission('acc_returns:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseReturnDto,
  ) {
    const original = await this.returnsService.originalBranchId(user.tenantId, 'purchase', dto.purchaseId);
    const scope = resolveBranchFromDocument(user, original, 'Purchase not found', dto.branchId);
    const ret = await this.returnsService.createPurchaseReturn(
      user.tenantId,
      scope,
      user.userId,
      dto,
    );
    return this.returnsService.toPurchaseReturnResponse(ret);
  }
}
