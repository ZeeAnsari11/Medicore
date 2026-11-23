import {
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
import { ExpenseCategoriesService } from './expense-categories.service';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto/expense-category.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope, resolveCreateBranch } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser, ExpenseCategory } from '@medicore/shared-types';

@Controller('accounting/expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly categoriesService: ExpenseCategoriesService) {}

  /** Main categories with their sub-categories; spend figures follow the branch the user is viewing. */
  @RequirePermission('acc_expenses:read')
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ): Promise<ExpenseCategory[]> {
    return this.categoriesService.list(user.tenantId, resolveBranchScope(user, branchId));
  }

  @RequirePermission('acc_expense_categories:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseCategoryDto) {
    // A new main category belongs to a branch (admins name it, branch users get their own); a sub-category takes its
    // category's.
    const branchId = dto.parentId ? undefined : resolveCreateBranch(user, dto.branchId);
    const created = await this.categoriesService.create(user.tenantId, dto, branchId);
    return {
      id: created._id,
      name: created.name,
      parentId: created.parentId,
      branchId: String(created.branchId),
      accountId: created.accountId,
      isActive: created.isActive,
    };
  }

  @RequirePermission('acc_expense_categories:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    const updated = await this.categoriesService.update(user.tenantId, id, dto);
    return {
      id: updated._id,
      name: updated.name,
      parentId: updated.parentId,
      accountId: updated.accountId,
      isActive: updated.isActive,
    };
  }

  @RequirePermission('acc_expense_categories:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.categoriesService.remove(user.tenantId, id);
  }
}
