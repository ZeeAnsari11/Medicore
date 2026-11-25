import { Controller, Get } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  /**
   * The account list that pickers need (payment cash/bank account, expense and journal accounts, general ledger).
   * There is no Chart of Accounts screen any more, so any accounting reader may read it.
   */
  @RequirePermission(
    'acc_payments:read',
    'acc_expenses:read',
    'acc_expense_categories:read',
    'acc_journal_entries:read',
    'acc_general_ledger:read',
    'acc_returns:read',
    'acc_profit_loss:read',
    'acc_balance_sheet:read',
  )
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const accounts = await this.accountsService.list(user.tenantId);
    return accounts.map((a) => this.accountsService.toAccountResponse(a));
  }
}
