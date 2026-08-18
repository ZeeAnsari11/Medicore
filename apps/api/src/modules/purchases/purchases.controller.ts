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
} from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchasePaymentDto } from './dto/update-purchase-payment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @RequirePermission('purchases:read')
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('vendorId') vendorId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const purchases = await this.purchasesService.listForTenant(user.tenantId, scope, vendorId);
    return purchases.map((p) => this.purchasesService.toPurchaseResponse(p));
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
    return this.purchasesService.toPurchaseResponse(purchase);
  }

  @RequirePermission('purchases:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePurchaseDto) {
    const scope = resolveBranchScope(user, dto.branchId);
    if (!scope) {
      throw new BadRequestException('branchId is required for admins creating a purchase');
    }
    return this.purchasesService.createPurchase(user.tenantId, scope, user.userId, dto);
  }

  @RequirePermission('purchases:update')
  @Patch(':id/payment')
  async updatePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePurchasePaymentDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const purchase = await this.purchasesService.updatePayment(user.tenantId, scope, id, dto);
    return this.purchasesService.toPurchaseResponse(purchase);
  }

  @RequirePermission('purchases:delete')
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
