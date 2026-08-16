import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermission('products:read')
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('manufacturerId') manufacturerId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    const products = await this.productsService.listForTenant(user.tenantId, {
      manufacturerId,
      categoryId,
      search,
    });
    return products.map((p) => this.productsService.toProductResponse(p));
  }

  @RequirePermission('products:create')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    const product = await this.productsService.createProduct(user.tenantId, dto);
    return this.productsService.toProductResponse(product);
  }

  @RequirePermission('products:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.productsService.updateProduct(user.tenantId, id, dto);
    return this.productsService.toProductResponse(product);
  }

  @RequirePermission('products:update')
  @Patch(':id/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    const product = await this.productsService.setStatus(user.tenantId, id, dto.status);
    return this.productsService.toProductResponse(product);
  }
}
