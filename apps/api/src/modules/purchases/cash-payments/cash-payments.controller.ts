import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { CashPaymentsService } from './cash-payments.service';
import { CreateCashPaymentDto } from './create-cash-payment.dto';
import { UpdateCashPaymentTransactionDto } from './update-cash-payment-transaction.dto';
import { ListCashPaymentTransactionsQueryDto } from './list-cash-payment-transactions-query.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import {
  resolveBranchFromDocument,
  resolveBranchScope,
} from '../../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

/**
 * Bulk purchase receipt (vendor payment sheet). Registered before `PurchasesController` so these static paths are
 * matched ahead of its `:id` routes.
 */
@Controller('purchases')
export class CashPaymentsController {
  constructor(private readonly cashPaymentsService: CashPaymentsService) {}

  @RequirePermission('cash_payment:read')
  @Get('invoices/lookup')
  async lookupInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q = '',
    @Query('branchId') branchId?: string,
    @Query('vendorId') vendorId?: string,
  ) {
    if (vendorId && !Types.ObjectId.isValid(vendorId)) throw new BadRequestException('Invalid vendorId');
    const scope = resolveBranchScope(user, branchId);
    return this.cashPaymentsService.lookup(user.tenantId, scope, q, vendorId || undefined);
  }

  /** Vendors we still owe money to on at least one purchase: the "by vendor" picker. */
  @RequirePermission('cash_payment:read')
  @Get('invoices/outstanding-parties')
  async outstandingVendors(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    return this.cashPaymentsService.outstandingVendors(user.tenantId, scope);
  }

  @RequirePermission('cash_payment:create')
  @Post('cash-payments')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCashPaymentDto) {
    // A sheet's branch is the branch of its invoices; the top-bar branch plays no part.
    const original = await this.cashPaymentsService.invoicesBranchId(
      user.tenantId,
      dto.rows.map((r) => r.invoiceId),
    );
    const scope = resolveBranchFromDocument(user, original, 'Invoice not found', dto.branchId);
    return this.cashPaymentsService.create(user.tenantId, scope, user.userId, dto);
  }

  /** The caller's own most recently created or edited transaction (or null), to prefill the Transaction # box. */
  @RequirePermission('cash_payment:read')
  @Get('cash-payments/last')
  async last(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    return {
      transaction: await this.cashPaymentsService.lastTransaction(user.tenantId, scope, user.userId),
    };
  }

  @RequirePermission('cash_payment:read')
  @Get('cash-payments')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCashPaymentTransactionsQueryDto,
  ) {
    const scope = resolveBranchScope(user, query.branchId);
    return this.cashPaymentsService.listTransactions(user.tenantId, scope, query);
  }

  /** The branch of a transaction is the branch of its entries; the caller may only see it if that is theirs. */
  private async transactionBranch(user: AuthenticatedUser, number: string): Promise<string> {
    const documentBranch = await this.cashPaymentsService.branchOfTransaction(user.tenantId, number);
    return resolveBranchFromDocument(user, documentBranch, 'Transaction not found');
  }

  @RequirePermission('cash_payment:read')
  @Get('cash-payments/by-number/:number')
  async getByNumber(@CurrentUser() user: AuthenticatedUser, @Param('number') number: string) {
    const scope = await this.transactionBranch(user, number);
    return this.cashPaymentsService.getByNumber(user.tenantId, scope, number);
  }

  @RequirePermission('cash_payment:read')
  @Get('cash-payments/by-number/:number/history')
  async history(@CurrentUser() user: AuthenticatedUser, @Param('number') number: string) {
    const scope = await this.transactionBranch(user, number);
    return this.cashPaymentsService.historyByNumber(user.tenantId, scope, number);
  }

  @RequirePermission('cash_payment:update')
  @Patch('cash-payments/by-number/:number')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('number') number: string,
    @Body() dto: UpdateCashPaymentTransactionDto,
  ) {
    const scope = await this.transactionBranch(user, number);
    return this.cashPaymentsService.update(user.tenantId, scope, user.userId, number, dto);
  }

  @RequirePermission('cash_payment:read')
  @Get('cash-payments/:id/pdf')
  async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('invoiceId') invoiceId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const doc = await this.cashPaymentsService.buildPdf(user.tenantId, scope, id, invoiceId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="cash-payment.pdf"');
    doc.pipe(res);
    doc.end();
  }
}
