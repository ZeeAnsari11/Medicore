import { Controller, Get, Query } from '@nestjs/common';
import { ProfitBreakdownService } from './profit-breakdown.service';
import { ProfitBreakdownQueryDto } from './profit-breakdown.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('reports/profit-breakdown')
export class ProfitBreakdownController {
  constructor(private readonly profitBreakdownService: ProfitBreakdownService) {}

  /** Gross profit for a period grouped by one dimension (customer, vendor, manufacturer, order booker, city, territory, product). */
  @RequirePermission('acc_profit_loss:read')
  @Get()
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: ProfitBreakdownQueryDto) {
    return this.profitBreakdownService.report(user.tenantId, resolveBranchScope(user, query.branchId), query);
  }
}
