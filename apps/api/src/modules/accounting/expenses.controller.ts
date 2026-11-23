import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseLedgerQueryDto } from './dto/expense-ledger-query.dto';
import { buildExpenseLedgerPdf } from './expense-ledger-pdf';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope, resolveCreateBranch } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @RequirePermission('acc_expenses:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const scope = resolveBranchScope(user, branchId);
    const expenses = await this.expensesService.listForTenant(user.tenantId, scope);
    return this.expensesService.toResponses(expenses);
  }

  /** Expense Sheet PDF for the filters on the Expenses page (branch, dates, category, sub-category, method, search). */
  @RequirePermission('acc_expenses:read')
  @Get('pdf')
  async ledgerPdf(@CurrentUser() user: AuthenticatedUser, @Query() query: ExpenseLedgerQueryDto, @Res() res: Response) {
    const data = await this.expensesService.ledger(user.tenantId, resolveBranchScope(user, query.branchId), query);
    const doc = buildExpenseLedgerPdf({ ...data, printedBy: user.username });
    const subject = (data.subCategoryName ?? data.categoryName ?? 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="expense-sheet-${subject || 'all'}.pdf"`);
    doc.pipe(res);
    doc.end();
  }

  @RequirePermission('acc_expenses:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    const scope = resolveCreateBranch(user, dto.branchId);
    const expense = await this.expensesService.createExpense(
      user.tenantId,
      scope,
      user.userId,
      dto,
    );
    return (await this.expensesService.toResponses([expense]))[0];
  }
}
