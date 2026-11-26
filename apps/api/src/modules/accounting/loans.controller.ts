import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto, CreateLoanRepaymentDto } from './dto/loan.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope, resolveCreateBranch } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @RequirePermission('acc_loans:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    const loans = await this.loansService.list(user.tenantId, resolveBranchScope(user, branchId));
    return loans.map((l) => this.loansService.toResponse(l));
  }

  @RequirePermission('acc_loans:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLoanDto) {
    const loan = await this.loansService.create(user.tenantId, resolveCreateBranch(user, dto.branchId), user.userId, dto);
    return this.loansService.toResponse(loan);
  }

  @RequirePermission('acc_loans:create')
  @Post(':id/repayments')
  @HttpCode(HttpStatus.CREATED)
  async repay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateLoanRepaymentDto) {
    return this.loansService.toResponse(await this.loansService.repay(user.tenantId, id, user.userId, dto));
  }
}
