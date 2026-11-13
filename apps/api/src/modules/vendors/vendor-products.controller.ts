import {
  BadRequestException,
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
import { VendorsService } from './vendors.service';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('vendor-products')
export class VendorProductsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @RequirePermission('vendors:read', 'purchases:create')
  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('product') product = '',
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.vendorsService.searchVendorsByProduct(
      user.tenantId,
      product,
      includeInactive === 'true',
    );
  }

  @RequirePermission('vendors:read', 'purchases:create')
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.vendorsService.summarizeVendorsByProduct(user.tenantId);
  }

  @RequirePermission('vendors:read', 'purchases:create')
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('productId') productId?: string,
    @Query('vendorId') vendorId?: string,
  ) {
    if (productId) {
      const links = await this.vendorsService.listVendorProductsForProduct(
        user.tenantId,
        productId,
      );
      return links.map((l) => this.vendorsService.toVendorProductResponse(l));
    }
    if (vendorId) {
      const links = await this.vendorsService.listVendorProductsForVendor(user.tenantId, vendorId);
      return links.map((l) => this.vendorsService.toVendorProductResponse(l));
    }
    throw new BadRequestException('productId or vendorId query param is required');
  }

  @RequirePermission('vendors:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVendorProductDto) {
    const link = await this.vendorsService.addVendorProduct(user.tenantId, dto);
    return this.vendorsService.toVendorProductResponse(link);
  }

  @RequirePermission('vendors:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVendorProductDto,
  ) {
    const link = await this.vendorsService.updateVendorProduct(user.tenantId, id, dto);
    return this.vendorsService.toVendorProductResponse(link);
  }

  @RequirePermission('vendors:update')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.vendorsService.deleteVendorProduct(user.tenantId, id);
  }
}
