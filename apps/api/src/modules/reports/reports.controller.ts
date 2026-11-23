import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../common/branch/branch-scope.util';
import { PermissionResolverService } from '../roles/permission-resolver.service';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly dashboardService: DashboardService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  /** Reports aggregate other modules' data, so the caller must also be able to view that module. */
  private async requireView(user: AuthenticatedUser, key: string) {
    if (!(await this.permissionResolver.has(user, key))) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  @RequirePermission('dashboard:read')
  @Get('dashboard-summary')
  async dashboardSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('todayStart') todayStart?: string,
    @Query('todayEnd') todayEnd?: string,
  ) {
    const scope = resolveBranchScope(user, branchId);
    // Dashboard menu = the overview totals; finance and report sections keep their own checks.
    return this.dashboardService.getSummary(user.tenantId, scope, todayStart, todayEnd);
  }

  @RequirePermission('reports:read')
  @Get('sales')
  async salesReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    await this.requireView(user, 'sales:read');
    const scope = resolveBranchScope(user, branchId);
    return this.reportsService.getSalesReport(user.tenantId, scope, startDate, endDate);
  }

  @RequirePermission('reports:read')
  @Get('inventory')
  async inventoryReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    await this.requireView(user, 'inventory:read');
    const scope = resolveBranchScope(user, branchId);
    return this.reportsService.getInventoryReport(user.tenantId, scope, search, startDate, endDate);
  }
}
