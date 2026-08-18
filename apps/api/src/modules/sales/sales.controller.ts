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
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSalePaymentDto } from './dto/update-sale-payment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermission('sales:read')
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const sales = await this.salesService.listForTenant(user.tenantId, scope, customerId);
    return sales.map((s) => this.salesService.toSaleResponse(s));
  }

  @RequirePermission('sales:read')
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const sale = await this.salesService.findOne(user.tenantId, scope, id);
    return this.salesService.toSaleResponse(sale);
  }

  @RequirePermission('sales:create')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSaleDto) {
    const scope = resolveBranchScope(user, dto.branchId);
    if (!scope) {
      throw new BadRequestException('branchId is required for admins creating a sale');
    }
    return this.salesService.createSale(user.tenantId, scope, user.userId, dto);
  }

  @RequirePermission('sales:update')
  @Patch(':id/payment')
  async updatePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalePaymentDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const sale = await this.salesService.updatePayment(user.tenantId, scope, id, dto);
    return this.salesService.toSaleResponse(sale);
  }

  @RequirePermission('sales:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.salesService.cancelSale(user.tenantId, scope, id, user.userId);
  }
}
