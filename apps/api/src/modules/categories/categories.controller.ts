import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateCategoryStatusDto } from './dto/update-category-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @RequirePermission('products:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const categories = await this.categoriesService.listForTenant(user.tenantId);
    return categories.map((c) => this.categoriesService.toCategoryResponse(c));
  }

  @RequirePermission('products:create')
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    const category = await this.categoriesService.createCategory(user.tenantId, dto);
    return this.categoriesService.toCategoryResponse(category);
  }

  @RequirePermission('products:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const category = await this.categoriesService.updateCategory(user.tenantId, id, dto);
    return this.categoriesService.toCategoryResponse(category);
  }

  @RequirePermission('products:update')
  @Patch(':id/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryStatusDto,
  ) {
    const category = await this.categoriesService.setStatus(user.tenantId, id, dto.isActive);
    return this.categoriesService.toCategoryResponse(category);
  }
}
