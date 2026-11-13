import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveCreateBranch } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @RequirePermission('vendors:read', 'purchases:create')
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('manufacturerId') manufacturerId?: string,
  ) {
    const vendors = await this.vendorsService.listForTenant(user.tenantId, manufacturerId);
    return vendors.map((v) => this.vendorsService.toVendorResponse(v));
  }

  @RequirePermission('vendors:read', 'purchases:create')
  @Get(':id/products')
  async listProducts(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const links = await this.vendorsService.listVendorProductsForVendor(user.tenantId, id);
    return links.map((l) => this.vendorsService.toVendorProductResponse(l));
  }

  @RequirePermission('vendors:create')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVendorDto) {
    const branchId = resolveCreateBranch(user, dto.branchId);
    const vendor = await this.vendorsService.createVendor(user.tenantId, { ...dto, branchId });
    return this.vendorsService.toVendorResponse(vendor);
  }

  @RequirePermission('vendors:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    const vendor = await this.vendorsService.updateVendor(user.tenantId, id, dto);
    return this.vendorsService.toVendorResponse(vendor);
  }

  @RequirePermission('vendors:update')
  @Patch(':id/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVendorStatusDto,
  ) {
    const vendor = await this.vendorsService.setStatus(user.tenantId, id, dto.isActive);
    return this.vendorsService.toVendorResponse(vendor);
  }
}
