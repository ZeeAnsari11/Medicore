import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import type { Category as CategoryType } from '@medicore/shared-types';

@Injectable()
export class CategoriesService extends TenantScopedRepository<CategoryDocument> {
  constructor(@InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>) {
    super(categoryModel);
  }

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    const existing = await this.categoryModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
    });

    if (existing) {
      throw new ConflictException(`A category named "${dto.name}" already exists`);
    }

    return this.categoryModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      parentCategoryId: dto.parentCategoryId ? new Types.ObjectId(dto.parentCategoryId) : undefined,
      isActive: true,
    });
  }

  async listForTenant(tenantId: string) {
    return this.categoryModel.find({ tenantId: new Types.ObjectId(tenantId) }).sort({ name: 1 });
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.findById(tenantId, id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.name !== undefined) {
      const existing = await this.categoryModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        name: dto.name,
        _id: { $ne: new Types.ObjectId(id) },
      });

      if (existing) {
        throw new ConflictException(`A category named "${dto.name}" already exists`);
      }

      category.name = dto.name;
    }

    if (dto.parentCategoryId !== undefined) {
      category.parentCategoryId = dto.parentCategoryId
        ? new Types.ObjectId(dto.parentCategoryId)
        : undefined;
    }

    return category.save();
  }

  async setStatus(tenantId: string, id: string, isActive: boolean) {
    const category = await this.findById(tenantId, id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    category.isActive = isActive;
    return category.save();
  }

  toCategoryResponse(category: CategoryDocument): CategoryType {
    const obj = category.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      name: obj.name,
      parentCategoryId: obj.parentCategoryId?.toString(),
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
