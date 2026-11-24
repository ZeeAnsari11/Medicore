import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LedgersService } from './ledgers.service';
import { LedgerExportService, LedgerExportSpec, PartiesExportSpec } from './ledger-export.service';
import { LedgerQueryDto, PartyBalancesQueryDto } from './dto/ledger-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser, PartyLedgerResponse } from '@medicore/shared-types';

const periodText = (q: LedgerQueryDto) =>
  q.from || q.to ? `${q.from ?? 'Beginning'} to ${q.to ?? 'Today'}` : 'All dates';

const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

/**
 * Ledgers read straight from posted journal entries (no separate balance tables).
 * Branch scoping goes through resolveBranchScope and every query is tenant-scoped in the service.
 */
@Controller('accounting')
export class LedgersController {
  constructor(
    private readonly ledgers: LedgersService,
    private readonly exporter: LedgerExportService,
  ) {}

  @RequirePermission('acc_general_ledger:read')
  @Get('general-ledger')
  async generalLedger(@CurrentUser() user: AuthenticatedUser, @Query() q: LedgerQueryDto) {
    return this.ledgers.generalLedger(user.tenantId, resolveBranchScope(user, q.branchId), q);
  }

  @RequirePermission('acc_general_ledger:export')
  @Get('general-ledger/export')
  async exportGeneralLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: LedgerQueryDto,
    @Res() res: Response,
  ) {
    const scope = resolveBranchScope(user, q.branchId);
    const [ledger, ctx] = await Promise.all([
      this.ledgers.generalLedger(user.tenantId, scope, q, true),
      this.ledgers.getPrintContext(user.tenantId, scope),
    ]);
    this.send(res, q.format, `general-ledger-${safeName(ledger.accountName)}`, {
      kind: 'GL',
      title: 'General Ledger',
      ...ctx,
      subjectLabel: 'Account',
      subjectName: `${ledger.accountCode} ${ledger.accountName}`,
      headerLeft: [ledger.accountCode, ledger.accountName, ctx.branchName],
      period: periodText(q),
      from: q.from,
      to: q.to,
      openingBalance: ledger.openingBalance,
      rows: ledger.rows,
      totalDebit: ledger.totalDebit,
      totalCredit: ledger.totalCredit,
      closingBalance: ledger.closingBalance,
      closingLabel: 'Closing balance',
    });
  }

  @RequirePermission('acc_customer_ledger:read')
  @Get('customers/balances')
  async customerBalances(@CurrentUser() user: AuthenticatedUser, @Query() q: PartyBalancesQueryDto) {
    return this.ledgers.partyBalances(user.tenantId, resolveBranchScope(user, q.branchId), 'CUSTOMER', q);
  }

  @RequirePermission('acc_customer_ledger:export')
  @Get('customers/balances/export')
  async exportCustomerBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: PartyBalancesQueryDto,
    @Res() res: Response,
  ) {
    await this.sendParties(res, user, q, 'CUSTOMER');
  }

  @RequirePermission('acc_customer_ledger:read')
  @Get('customers/:id/ledger')
  async customerLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: LedgerQueryDto,
  ) {
    return this.ledgers.customerLedger(user.tenantId, resolveBranchScope(user, q.branchId), id, q);
  }

  @RequirePermission('acc_customer_ledger:export')
  @Get('customers/:id/ledger/export')
  async exportCustomerLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: LedgerQueryDto,
    @Res() res: Response,
  ) {
    const scope = resolveBranchScope(user, q.branchId);
    const [ledger, ctx] = await Promise.all([
      this.ledgers.customerLedger(user.tenantId, scope, id, q, true),
      this.ledgers.getPrintContext(user.tenantId, scope),
    ]);
    this.sendParty(res, q, ledger, ctx, 'CUSTOMER');
  }

  @RequirePermission('acc_vendor_ledger:read')
  @Get('vendors/balances')
  async vendorBalances(@CurrentUser() user: AuthenticatedUser, @Query() q: PartyBalancesQueryDto) {
    return this.ledgers.partyBalances(user.tenantId, resolveBranchScope(user, q.branchId), 'VENDOR', q);
  }

  @RequirePermission('acc_vendor_ledger:export')
  @Get('vendors/balances/export')
  async exportVendorBalances(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: PartyBalancesQueryDto,
    @Res() res: Response,
  ) {
    await this.sendParties(res, user, q, 'VENDOR');
  }

  @RequirePermission('acc_vendor_ledger:read')
  @Get('vendors/:id/ledger')
  async vendorLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: LedgerQueryDto,
  ) {
    return this.ledgers.vendorLedger(user.tenantId, resolveBranchScope(user, q.branchId), id, q);
  }

  @RequirePermission('acc_vendor_ledger:export')
  @Get('vendors/:id/ledger/export')
  async exportVendorLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() q: LedgerQueryDto,
    @Res() res: Response,
  ) {
    const scope = resolveBranchScope(user, q.branchId);
    const [ledger, ctx] = await Promise.all([
      this.ledgers.vendorLedger(user.tenantId, scope, id, q, true),
      this.ledgers.getPrintContext(user.tenantId, scope),
    ]);
    this.sendParty(res, q, ledger, ctx, 'VENDOR');
  }

  /** The all-customers / all-vendors table as CSV or PDF: every row that matches the filters, with the summary totals on top. */
  private async sendParties(
    res: Response,
    user: AuthenticatedUser,
    q: PartyBalancesQueryDto,
    kind: 'CUSTOMER' | 'VENDOR',
  ) {
    const isCustomer = kind === 'CUSTOMER';
    const scope = resolveBranchScope(user, q.branchId);
    const [data, ctx] = await Promise.all([
      this.ledgers.partyBalances(user.tenantId, scope, kind, { ...q, page: 1, limit: 100_000 }),
      this.ledgers.getPrintContext(user.tenantId, scope),
    ]);
    const s = data.summary;
    const filters = [q.hasBalance === 'true' ? 'Has balance only' : null, q.search?.trim() ? `Search: ${q.search.trim()}` : null].filter(Boolean);
    const spec: PartiesExportSpec = {
      title: isCustomer ? 'All Customers Ledger' : 'All Vendors Ledger',
      ...ctx,
      partyLabel: isCustomer ? 'Customer' : 'Vendor',
      billedLabel: isCustomer ? 'Total invoiced' : 'Total purchased',
      settledLabel: isCustomer ? 'Total received' : 'Total paid',
      accountLabel: isCustomer ? 'Accounts Receivable' : 'Accounts Payable',
      filterText: filters.join(' · '),
      summary: s
        ? [
            ['Opening balance', s.openingBalance],
            [isCustomer ? 'Total invoiced' : 'Total purchased', s.billed],
            [isCustomer ? 'Total received' : 'Total paid', s.settled],
            ['Total returns', s.returns],
            ['Advances', s.advances],
            ['Closing balance', s.closingBalance],
          ]
        : [],
      rows: data.items.map((r) => ({
        name: r.name,
        billed: r.billed ?? 0,
        settled: r.settled ?? 0,
        returns: r.returns ?? 0,
        account: r.accountBalance,
        advance: r.advanceBalance,
        balance: r.balance,
      })),
    };
    const base = isCustomer ? 'all-customers-ledger' : 'all-vendors-ledger';
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      res.send(this.exporter.buildPartiesCsv(spec));
      return;
    }
    const doc = this.exporter.buildParties(spec);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${base}.pdf"`);
    doc.pipe(res);
    doc.end();
  }

  private sendParty(
    res: Response,
    q: LedgerQueryDto,
    ledger: PartyLedgerResponse,
    ctx: { businessName: string; branchName: string; branchAddress?: string },
    kind: 'CUSTOMER' | 'VENDOR',
  ) {
    const isCustomer = kind === 'CUSTOMER';
    const statement = q.format === 'statement';
    const closing = ledger.closingBalance;
    const s = ledger.summary;
    const spec: LedgerExportSpec = {
      kind: 'PARTY',
      title: statement ? 'Statement of Account' : isCustomer ? 'Customer Ledger' : 'Vendor Ledger',
      ...ctx,
      subjectLabel: isCustomer ? 'Customer' : 'Vendor',
      subjectName: ledger.partyName,
      headerLeft: [ledger.partyCode, ledger.partyName, ledger.partyAddress],
      headerRight: ledger.partyCity,
      period: periodText(q),
      from: q.from,
      to: q.to,
      openingBalance: ledger.openingBalance,
      rows: ledger.rows,
      totalDebit: ledger.totalDebit,
      totalCredit: ledger.totalCredit,
      closingBalance: closing,
      closingLabel:
        closing >= 0
          ? isCustomer
            ? 'Balance due'
            : 'Balance payable'
          : isCustomer
            ? 'Credit balance (advance)'
            : 'Prepayment with vendor',
      summary: [
        ['Opening balance', s.openingBalance],
        [isCustomer ? 'Total invoiced' : 'Total purchased', s.billed],
        [isCustomer ? 'Total received' : 'Total paid', s.settled],
        [isCustomer ? 'Total returns' : 'Total returns', s.returns],
        ['Advances', s.advances],
        ['Closing balance', s.closingBalance],
      ],
      footerNote: statement
        ? 'Please settle any balance due. If anything on this statement looks incorrect, contact us.'
        : undefined,
    };
    const base = `${statement ? 'statement' : isCustomer ? 'customer-ledger' : 'vendor-ledger'}-${safeName(ledger.partyName)}`;
    this.send(res, q.format, base, spec);
  }

  private send(res: Response, format: LedgerQueryDto['format'], base: string, spec: LedgerExportSpec) {
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      res.send(this.exporter.buildCsv(spec));
      return;
    }
    const doc = this.exporter.build(spec);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${base}.pdf"`);
    doc.pipe(res);
    doc.end();
  }
}
