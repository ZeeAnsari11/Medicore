import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SsrService } from './ssr.service';
import { SsrExportService } from './ssr-export.service';
import { SsrExportQueryDto, SsrQueryDto } from './ssr.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { resolveBranchScope } from '../../../common/branch/branch-scope.util';
import { PermissionResolverService } from '../../roles/permission-resolver.service';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('reports/ssr')
export class SsrController {
  constructor(
    private readonly ssrService: SsrService,
    private readonly exportService: SsrExportService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  private canViewCost(user: AuthenticatedUser) {
    return this.permissionResolver.has(user, 'ssr:view_cost');
  }

  @RequirePermission('ssr:read')
  @Get()
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: SsrQueryDto) {
    const scope = resolveBranchScope(user, query.branchId);
    return this.ssrService.report(user.tenantId, scope, query, await this.canViewCost(user));
  }

  /** Product-level stock statement behind the PDF ("Sale & Stock Report"). */
  @RequirePermission('ssr:read')
  @Get('stock-statement')
  async stockStatement(@CurrentUser() user: AuthenticatedUser, @Query() query: SsrQueryDto) {
    return this.ssrService.stockStatement(user.tenantId, resolveBranchScope(user, query.branchId), query);
  }

  @RequirePermission('ssr:export')
  @Get('export')
  async export(@CurrentUser() user: AuthenticatedUser, @Query() query: SsrExportQueryDto, @Res() res: Response) {
    const scope = resolveBranchScope(user, query.branchId);
    const result = await this.ssrService.report(user.tenantId, scope, query, await this.canViewCost(user), {
      unpaged: true,
    });
    if (query.format === 'pdf') return this.exportService.sendStockPdf(res, user.tenantId, scope, query, result);
    await this.exportService.send(res, user.tenantId, scope, query, result, query.format);
  }

  @RequirePermission('ssr:read')
  @Get('product/:id/invoices')
  async productInvoices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: SsrQueryDto,
  ) {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new BadRequestException('Invalid product id');
    const scope = resolveBranchScope(user, query.branchId);
    return this.ssrService.productInvoices(user.tenantId, scope, id, query);
  }
}
