import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SalesService } from './sales.service';
import { OrderBookersService } from './order-bookers.service';
import { ReassignOrderBookerDto } from './dto/reassign-order-booker.dto';
import { CashReceiptsService } from './cash-receipts.service';
import { CreateCashReceiptDto } from './dto/create-cash-receipt.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateCashTransactionDto } from './dto/update-cash-transaction.dto';
import { ListCashTransactionsQueryDto } from './dto/list-cash-transactions-query.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { UpdateSalePaymentDto } from './dto/update-sale-payment.dto';
import {
  PendingOrdersQueryDto,
  PendingOrdersSummaryQueryDto,
  ProcessOrdersDto,
} from './dto/process-orders.dto';
import { CreateSaleReturnDto } from '../accounting/dto/create-sale-return.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  resolveBranchFromDocument,
  resolveBranchScope,
  resolveCreateBranch,
  isAdminUser,
} from '../../common/branch/branch-scope.util';
import { canEditSaleOf, resolveOwnSalesScope } from '../../common/branch/order-booker-scope.util';
import { PermissionResolverService } from '../roles/permission-resolver.service';
import { SaleStatus } from '@medicore/shared-types';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly cashReceiptsService: CashReceiptsService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly orderBookers: OrderBookersService,
  ) {}

  /** Id of the only Order Booker whose sales this user may see, or null when they see every sale. */
  private async ownScope(user: AuthenticatedUser): Promise<string | null> {
    return resolveOwnSalesScope(user, await this.permissionResolver.has(user, 'sales:view_all'));
  }

  /** Another person's sale is a 404 for an Order Booker. */
  private async assertVisible(user: AuthenticatedUser, scope: string | null, id: string): Promise<void> {
    const owner = await this.ownScope(user);
    if (owner) await this.salesService.findOne(user.tenantId, scope, id, owner);
  }

  @RequirePermission('sales:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSalesQueryDto) {
    const scope = resolveBranchScope(user, query.branchId);
    const owner = await this.ownScope(user);
    if (owner) query.orderBookerId = owner;
    if (query.page === undefined && query.limit === undefined) {
      const sales = await this.salesService.listForTenant(user.tenantId, scope, query);
      return sales.map((s) => this.salesService.toSaleResponse(s));
    }
    const { items, ...meta } = await this.salesService.listPageForTenant(user.tenantId, scope, query);
    return { items: items.map((s) => this.salesService.toSaleResponse(s)), ...meta };
  }

  /** Declared before `:id` routes so `report/pdf` is not read as a sale id. */
  @RequirePermission('sales:read')
  @Get('report/pdf')
  async reportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSalesQueryDto,
    @Res() res: Response,
  ) {
    const scope = resolveBranchScope(user, query.branchId);
    const owner = await this.ownScope(user);
    if (owner) query.orderBookerId = owner;
    const doc = await this.salesService.buildReportPdf(user.tenantId, scope, query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="sales-report.pdf"');
    doc.pipe(res);
    doc.end();
  }

  @RequirePermission('sales:read', 'sales:create')
  @Get('order-bookers')
  async listOrderBookers(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    const canPickOthers =
      (await this.permissionResolver.has(user, 'sales:view_all')) ||
      (await this.permissionResolver.has(user, 'sales:book_for_others'));
    return this.orderBookers.listOptions(user, scope, canPickOthers || isAdminUser(user));
  }

  @RequirePermission('cash_receipt:read')
  @Get('invoices/lookup')
  async lookupInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q = '',
    @Query('branchId') branchId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    return this.cashReceiptsService.lookup(user.tenantId, scope, q, await this.ownScope(user), customerId || undefined);
  }

  /** Customers who still owe money on at least one invoice: the Cash Receipt "by customer" picker. */
  @RequirePermission('cash_receipt:read')
  @Get('invoices/outstanding-parties')
  async outstandingCustomers(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    return this.cashReceiptsService.outstandingCustomers(user.tenantId, scope, await this.ownScope(user));
  }

  @RequirePermission('cash_receipt:create')
  @Post('cash-receipts')
  async createCashReceipt(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCashReceiptDto) {
    // A sheet's branch is the branch of its invoices; the top-bar branch plays no part.
    const original = await this.cashReceiptsService.invoicesBranchId(
      user.tenantId,
      dto.rows.map((r) => r.invoiceId),
      await this.ownScope(user),
    );
    const scope = resolveBranchFromDocument(user, original, 'Invoice not found', dto.branchId);
    return this.cashReceiptsService.create(user.tenantId, scope, user.userId, dto);
  }

  /** The caller's own most recently created or edited transaction (or null), to prefill the Transaction # box. */
  @RequirePermission('cash_receipt:read')
  @Get('cash-receipts/last')
  async lastCashTransaction(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    return { transaction: await this.cashReceiptsService.lastTransaction(user.tenantId, scope, user.userId) };
  }

  @RequirePermission('cash_receipt:read')
  @Get('cash-receipts')
  async listCashTransactions(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCashTransactionsQueryDto) {
    const scope = resolveBranchScope(user, query.branchId);
    // An Order Booker sees the transactions they saved themselves.
    const owner = await this.ownScope(user);
    return this.cashReceiptsService.listTransactions(user.tenantId, scope, query, owner);
  }

  /** The branch of a transaction is the branch of its entries; the caller may only see it if that is theirs. */
  private async transactionBranch(user: AuthenticatedUser, number: string): Promise<string> {
    const documentBranch = await this.cashReceiptsService.branchOfTransaction(
      user.tenantId,
      number,
    );
    return resolveBranchFromDocument(user, documentBranch, 'Transaction not found');
  }

  @RequirePermission('cash_receipt:read')
  @Get('cash-receipts/by-number/:number')
  async getCashTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
  ) {
    const scope = await this.transactionBranch(user, number);
    return this.cashReceiptsService.getByNumber(
      user.tenantId,
      scope,
      number,
      await this.ownScope(user),
    );
  }

  @RequirePermission('cash_receipt:read')
  @Get('cash-receipts/by-number/:number/history')
  async cashTransactionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
  ) {
    const scope = await this.transactionBranch(user, number);
    return this.cashReceiptsService.historyByNumber(
      user.tenantId,
      scope,
      number,
      await this.ownScope(user),
    );
  }

  @RequirePermission('cash_receipt:update')
  @Patch('cash-receipts/by-number/:number')
  async updateCashTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: UpdateCashTransactionDto,
  ) {
    const scope = await this.transactionBranch(user, number);
    return this.cashReceiptsService.update(
      user.tenantId,
      scope,
      user.userId,
      number,
      dto,
      await this.ownScope(user),
    );
  }

  @RequirePermission('cash_receipt:read')
  @Get('cash-receipts/:id/pdf')
  async cashReceiptPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('invoiceId') invoiceId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const doc = await this.cashReceiptsService.buildPdf(user.tenantId, scope, id, invoiceId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="cash-receipt.pdf"');
    doc.pipe(res);
    doc.end();
  }

  /** Advance the customer can spend on a new invoice; `canApply` is false when the caller's sales stay pending orders. */
  @RequirePermission('sales:create')
  @Get('customer-advance/:customerId')
  async customerAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveCreateBranch(user, branchId);
    return {
      advanceBalance: await this.salesService.getCustomerAdvance(user.tenantId, scope, customerId),
      canApply: await this.permissionResolver.has(user, 'skip_process_order:read'),
    };
  }

  @RequirePermission('sales:read', 'sales:create')
  @Get('last-price')
  async lastPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Query('customerId') customerId: string,
    @Query('productIds') productIds?: string | string[],
    @Query('branchId') branchId?: string,
  ) {
    const ids = ([] as string[]).concat(productIds ?? []).flatMap((s) => s.split(',')).filter(Boolean);
    if (!customerId || ids.length === 0) return [];
    const scope = resolveBranchScope(user, branchId);
    return this.salesService.getLastPrices(user.tenantId, scope, customerId, ids);
  }

  @RequirePermission('process_orders:read')
  @Get('orders/summary')
  async pendingOrderSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: PendingOrdersSummaryQueryDto) {
    const scope = resolveBranchScope(user, query.branchId);
    return this.salesService.pendingOrderSummary(user.tenantId, scope, query.date);
  }

  @RequirePermission('process_orders:read')
  @Get('orders')
  async pendingOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: PendingOrdersQueryDto) {
    const scope = resolveBranchScope(user, query.branchId);
    return this.salesService.pendingOrders(user.tenantId, scope, query.date, query.orderBookerId);
  }

  @RequirePermission('process_orders:read')
  @Get('orders/preview')
  async pendingOrdersPreview(@CurrentUser() user: AuthenticatedUser, @Query() query: PendingOrdersQueryDto) {
    const scope = resolveBranchScope(user, query.branchId);
    return this.salesService.pendingOrdersPreview(user.tenantId, scope, query.date, query.orderBookerId);
  }

  @RequirePermission('process_orders:read')
  @Post('orders/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmOrders(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProcessOrdersDto) {
    const scope = resolveBranchScope(user, dto.branchId);
    const processed = await this.salesService.confirmOrders(user.tenantId, scope, user.userId, dto.saleIds);
    return { processed };
  }

  @RequirePermission('process_orders:read')
  @Post('orders/reject')
  @HttpCode(HttpStatus.OK)
  async rejectOrders(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProcessOrdersDto) {
    const scope = resolveBranchScope(user, dto.branchId);
    const processed = await this.salesService.rejectOrders(user.tenantId, scope, user.userId, dto.saleIds);
    return { processed };
  }

  @RequirePermission('sales:read')
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    // A pending order is readable here (the booker's own, or by someone who processes orders) so it can be reviewed.
    const sale = await this.salesService.findOne(user.tenantId, scope, id, await this.ownScope(user), true);
    if (sale.status === SaleStatus.PENDING && !(await this.canViewPending(user, sale.orderBookerId?.toString()))) {
      throw new NotFoundException('Sale not found');
    }
    return this.salesService.toSaleDetailResponse(sale);
  }

  /** The booker who placed a pending order, and anyone who processes orders, may look at it. */
  private async canViewPending(user: AuthenticatedUser, orderBookerId?: string): Promise<boolean> {
    return (
      orderBookerId === user.userId ||
      isAdminUser(user) ||
      (await this.permissionResolver.has(user, 'process_orders:read'))
    );
  }

  @RequirePermission('sales:read')
  @Get(':id/pdf')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.assertVisible(user, scope, id);
    const doc = await this.salesService.buildInvoicePdf(user.tenantId, scope, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="invoice.pdf"');
    doc.pipe(res);
    doc.end();
  }

  @RequirePermission('sales:create')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSaleDto) {
    if (
      dto.items.some((i) => (i.discountPercent ?? 0) > 0) &&
      !(await this.permissionResolver.has(user, 'sales:discount'))
    ) {
      throw new ForbiddenException('You do not have permission to give discounts');
    }
    const scope = resolveCreateBranch(user, dto.branchId);
    const canBookForOthers =
      isAdminUser(user) || (await this.permissionResolver.has(user, 'sales:book_for_others'));
    const orderBooker = await this.orderBookers.resolveForCreate(user, scope, dto.orderBookerId, canBookForOthers);
    // A new sale waits as a pending order until someone with process_orders:read confirms it,
    // unless the person placing it has skip_process_order:read: then it is an invoice at once.
    const skipProcessing = await this.permissionResolver.has(user, 'skip_process_order:read');
    return this.salesService.createSale(user.tenantId, scope, user.userId, dto, orderBooker, !skipProcessing);
  }

  @RequirePermission('sales:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
    @Query('branchId') branchId?: string,
  ) {
    if (
      dto.items.some((i) => (i.discountPercent ?? 0) > 0) &&
      !(await this.permissionResolver.has(user, 'sales:discount'))
    ) {
      throw new ForbiddenException('You do not have permission to give discounts');
    }
    const scope = resolveBranchScope(user, branchId);
    const current = await this.salesService.findOne(user.tenantId, scope, id, await this.ownScope(user));
    if (!canEditSaleOf(user, current.orderBookerId?.toString())) {
      throw new ForbiddenException('Only the Order Booker or an admin can edit this sale');
    }
    const sale = await this.salesService.updateSale(user.tenantId, scope, user.userId, id, dto);
    // An edit only succeeds on an unpaid sale, and the result is unpaid too, so it stays editable.
    return { ...sale, isEditable: true };
  }

  @RequirePermission('sales:read')
  @Get(':id/payments')
  async listPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.assertVisible(user, scope, id);
    return this.salesService.listPayments(user.tenantId, scope, id);
  }

  @RequirePermission('sales:read')
  @Get(':id/returns')
  async listReturns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.assertVisible(user, scope, id);
    return this.salesService.listReturns(user.tenantId, scope, id);
  }

  @RequirePermission('sales:read')
  @Get(':id/returns/:returnId/pdf')
  async downloadReturnPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('returnId') returnId: string,
    @Res() res: Response,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.assertVisible(user, scope, id);
    const doc = await this.salesService.buildReturnPdf(user.tenantId, scope, id, returnId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="sale-return.pdf"');
    doc.pipe(res);
    doc.end();
  }

  @RequirePermission('sales:return')
  @Post(':id/returns')
  @HttpCode(HttpStatus.CREATED)
  async createReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.assertVisible(user, scope, id);
    return this.salesService.createReturn(user.tenantId, scope, user.userId, id, dto);
  }

  @RequirePermission('sales:record_payment')
  @Patch(':id/payment')
  async updatePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSalePaymentDto,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.assertVisible(user, scope, id);
    const sale = await this.salesService.updatePayment(user.tenantId, scope, user.userId, id, dto);
    return this.salesService.toSaleResponse(sale);
  }

  @RequirePermission('sales:void')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    await this.assertVisible(user, scope, id);
    await this.salesService.cancelSale(user.tenantId, scope, id, user.userId);
  }

  @RequirePermission('sales:read')
  @Patch(':id/order-booker')
  async reassignOrderBooker(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReassignOrderBookerDto,
    @Query('branchId') branchId?: string,
  ) {
    if (!isAdminUser(user)) throw new ForbiddenException('Only an admin can reassign the Order Booker');
    const scope = resolveBranchScope(user, branchId);
    return this.salesService.reassignOrderBooker(user.tenantId, scope, user.userId, id, dto.orderBookerId, dto.reason);
  }
}
