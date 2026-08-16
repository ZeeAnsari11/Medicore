import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @RequirePermission('vendors:read')
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('manufacturerId') manufacturerId?: string,
  ) {
    const vendors = await this.vendorsService.listForTenant(user.tenantId, manufacturerId);
    return vendors.map((v) => this.vendorsService.toVendorResponse(v));
  }

  @RequirePermission('vendors:create')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVendorDto) {
    const vendor = await this.vendorsService.createVendor(user.tenantId, dto);
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
