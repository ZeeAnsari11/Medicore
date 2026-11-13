import { Controller, Get, Query } from '@nestjs/common';
import { LedgerReportsService } from './ledger-reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/reports')
export class LedgerReportsController {
  constructor(private readonly ledgerReportsService: LedgerReportsService) {}

  @RequirePermission('acc_overview:read')
  @Get('overview')
  async overview(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    return this.ledgerReportsService.getOverview(user.tenantId, scope);
  }

  @RequirePermission('acc_trial_balance:read')
  @Get('trial-balance')
  async trialBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    return this.ledgerReportsService.getTrialBalance(user.tenantId, scope, asOfDate);
  }

  @RequirePermission('acc_profit_loss:read')
  @Get('profit-loss')
  async profitLoss(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    return this.ledgerReportsService.getProfitLoss(user.tenantId, scope, startDate, endDate);
  }

  @RequirePermission('acc_balance_sheet:read')
  @Get('balance-sheet')
  async balanceSheet(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    return this.ledgerReportsService.getBalanceSheet(user.tenantId, scope, asOfDate);
  }
}
