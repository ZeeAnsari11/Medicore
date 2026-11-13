import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { AddProductVendorDto } from './dto/create-vendor-product.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

/** Product-centric view of the VendorProduct link (the `/vendor-products` routes stay for the web UI). */
@Controller('products/:productId/vendors')
export class ProductVendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @RequirePermission('vendors:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    const links = await this.vendorsService.listVendorProductsForProduct(user.tenantId, productId);
    return links.map((l) => this.vendorsService.toVendorProductResponse(l));
  }

  @RequirePermission('vendors:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: AddProductVendorDto,
  ) {
    const link = await this.vendorsService.addVendorProduct(user.tenantId, { ...dto, productId });
    return this.vendorsService.toVendorProductResponse(link);
  }

  @RequirePermission('vendors:update')
  @Put(':vendorId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('vendorId') vendorId: string,
    @Body() dto: UpdateVendorProductDto,
  ) {
    const link = await this.vendorsService.findVendorProductLink(user.tenantId, productId, vendorId);
    const updated = await this.vendorsService.updateVendorProduct(user.tenantId, link.id, dto);
    return this.vendorsService.toVendorProductResponse(updated);
  }

  @RequirePermission('vendors:update')
  @Delete(':vendorId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('vendorId') vendorId: string,
  ) {
    const link = await this.vendorsService.findVendorProductLink(user.tenantId, productId, vendorId);
    await this.vendorsService.deleteVendorProduct(user.tenantId, link.id);
  }
}
