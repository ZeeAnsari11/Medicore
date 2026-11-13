import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
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
    return expenses.map((e) => this.expensesService.toExpenseResponse(e));
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
    return this.expensesService.toExpenseResponse(expense);
  }
}
