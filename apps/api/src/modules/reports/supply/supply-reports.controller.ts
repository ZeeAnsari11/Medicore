import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '@medicore/shared-types';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../../common/branch/branch-scope.util';
import { resolveOwnSalesScope } from '../../../common/branch/order-booker-scope.util';
import { PermissionResolverService } from '../../roles/permission-resolver.service';
import { SupplyReportQueryDto } from './supply-reports.dto';
import { SupplyReportsService } from './supply-reports.service';
import { buildSupplyLedgerPdf } from './supply-ledger-pdf';
import { buildSupplySummaryPdf } from './supply-summary-pdf';

/**
 * Supply Ledger and Supply Summary: read-only sheets over the same sales as the Sales page, so they need the same
 * `sales:read`, stay inside the caller's branch scope, and an Order Booker without `sales:view_all` only sees their own.
 */
@Controller('reports')
export class SupplyReportsController {
  constructor(
    private readonly service: SupplyReportsService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  private async ownBooker(user: AuthenticatedUser) {
    return resolveOwnSalesScope(user, await this.permissionResolver.has(user, 'sales:view_all'));
  }

  private pdf(res: Response, doc: PDFKit.PDFDocument, fileName: string) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    doc.pipe(res);
    doc.end();
  }

  @RequirePermission('sales:read')
  @Get('supply/filters')
  async filters(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    return this.service.filters(user.tenantId, resolveBranchScope(user, branchId));
  }

  @RequirePermission('sales:read')
  @Get('supply-ledger/preview')
  async ledgerPreview(@CurrentUser() user: AuthenticatedUser, @Query() q: SupplyReportQueryDto) {
    return this.service.ledger(user.tenantId, resolveBranchScope(user, q.branchId), await this.ownBooker(user), q, user.username);
  }

  @RequirePermission('sales:read')
  @Get('supply-ledger')
  async ledgerPdf(@CurrentUser() user: AuthenticatedUser, @Query() q: SupplyReportQueryDto, @Res() res: Response) {
    const report = await this.service.ledger(user.tenantId, resolveBranchScope(user, q.branchId), await this.ownBooker(user), q, user.username);
    this.pdf(res, buildSupplyLedgerPdf(report), 'supply-ledger.pdf');
  }

  @RequirePermission('sales:read')
  @Get('supply-summary/preview')
  async summaryPreview(@CurrentUser() user: AuthenticatedUser, @Query() q: SupplyReportQueryDto) {
    return this.service.summary(user.tenantId, resolveBranchScope(user, q.branchId), await this.ownBooker(user), q, user.username);
  }

  @RequirePermission('sales:read')
  @Get('supply-summary')
  async summaryPdf(@CurrentUser() user: AuthenticatedUser, @Query() q: SupplyReportQueryDto, @Res() res: Response) {
    const report = await this.service.summary(user.tenantId, resolveBranchScope(user, q.branchId), await this.ownBooker(user), q, user.username);
    this.pdf(res, buildSupplySummaryPdf(report), 'supply-summary.pdf');
  }
}
