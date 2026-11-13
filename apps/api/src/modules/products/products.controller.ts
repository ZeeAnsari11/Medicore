import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionResolverService } from '../roles/permission-resolver.service';
import { resolveCreateBranch } from '../../common/branch/branch-scope.util';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  @RequirePermission('products:read', 'purchases:create', 'sales:create', 'inventory:adjust')
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
    const product = await this.productsService.createProduct(user.tenantId, {
      ...dto,
      branchId: resolveCreateBranch(user, dto.branchId),
    });
    return this.productsService.toProductResponse(product);
  }

  @RequirePermission('products:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const changesPrices =
      dto.tp !== undefined || dto.cp !== undefined || dto.rp !== undefined;
    if (changesPrices && !(await this.permissionResolver.has(user, 'products:edit_prices'))) {
      throw new ForbiddenException('You do not have permission to edit prices');
    }
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
