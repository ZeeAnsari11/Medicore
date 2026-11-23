import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ProfitStatementService } from './profit-statement.service';
import { ProfitStatementQueryDto } from './profit-statement.dto';
import { buildProfitStatementPdf } from './profit-statement-pdf';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('reports/profit-statement')
export class ProfitStatementController {
  constructor(private readonly profitStatementService: ProfitStatementService) {}

  /** Stock-based Profit & Loss Statement (net sales, cost of goods from stock, expenses, net profit). */
  @RequirePermission('acc_profit_loss:read')
  @Get()
  async statement(@CurrentUser() user: AuthenticatedUser, @Query() query: ProfitStatementQueryDto) {
    return this.profitStatementService.statement(user.tenantId, resolveBranchScope(user, query.branchId), query);
  }

  @RequirePermission('acc_profit_loss:read')
  @Get('pdf')
  async pdf(@CurrentUser() user: AuthenticatedUser, @Query() query: ProfitStatementQueryDto, @Res() res: Response) {
    const statement = await this.profitStatementService.statement(user.tenantId, resolveBranchScope(user, query.branchId), query);
    const doc = buildProfitStatementPdf(statement, user.username);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="profit-loss-${query.from}-to-${query.to}.pdf"`);
    doc.pipe(res);
    doc.end();
  }
}
