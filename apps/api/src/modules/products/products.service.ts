import { escapeRegex } from '../../common/utils/escape-regex';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { Manufacturer, ManufacturerDocument } from '../manufacturers/schemas/manufacturer.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductStatus } from '@medicore/shared-types';
import type { Product as ProductType } from '@medicore/shared-types';

export interface ProductListFilters {
  manufacturerId?: string;
  categoryId?: string;
  search?: string;
}

@Injectable()
export class ProductsService extends TenantScopedRepository<ProductDocument> {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Manufacturer.name) private readonly manufacturerModel: Model<ManufacturerDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
  ) {
    super(productModel);
  }

  /**
   * manufacturerId / categoryId come from the client: they must belong to the caller's tenant, and a
   * manufacturer must be shared (no branch) or belong to the product's branch.
   */
  private async assertReferencesInTenant(
    tenantId: string,
    branchId: string,
    manufacturerId?: string,
    categoryId?: string,
  ) {
    const tenantOid = new Types.ObjectId(tenantId);
    if (manufacturerId) {
      const ok = await this.manufacturerModel.exists({
        _id: new Types.ObjectId(manufacturerId),
        tenantId: tenantOid,
        $or: [{ branchId: { $exists: false } }, { branchId: null }, { branchId: new Types.ObjectId(branchId) }],
      });
      if (!ok) throw new BadRequestException('Manufacturer not found in this branch');
    }
    if (categoryId) {
      const ok = await this.categoryModel.exists({ _id: new Types.ObjectId(categoryId), tenantId: tenantOid });
      if (!ok) throw new BadRequestException('Category not found');
    }
  }

  /** TP must cover the cost price, and the printed retail price (when given) must not undercut TP. */
  private assertPriceRules({ tp, cp, rp }: { tp: number; cp: number; rp?: number }) {
    if (tp < cp) {
      throw new BadRequestException(`Trade price (TP ${tp}) must be at least the cost price (CP ${cp})`);
    }
    if (rp !== undefined && rp !== null && rp < tp) {
      throw new BadRequestException(`Retail price (RP ${rp}) must be at least the trade price (TP ${tp})`);
    }
  }

  /** `dto.branchId` is already resolved by the controller (`resolveCreateBranch`). */
  async createProduct(tenantId: string, dto: CreateProductDto & { branchId: string }) {
    await this.assertReferencesInTenant(tenantId, dto.branchId, dto.manufacturerId, dto.categoryId);
    if (dto.barcode) {
      await this.assertBarcodeAvailable(tenantId, dto.branchId, dto.barcode);
    }

    this.assertPriceRules(dto);

    return this.productModel.create({
      tenantId: new Types.ObjectId(tenantId),
      branchId: new Types.ObjectId(dto.branchId),
      name: dto.name,
      genericName: dto.genericName,
      manufacturerId: new Types.ObjectId(dto.manufacturerId),
      categoryId: dto.categoryId ? new Types.ObjectId(dto.categoryId) : undefined,
      barcode: dto.barcode,
      unit: dto.unit,
      packing: dto.packing,
      tp: dto.tp,
      cp: dto.cp,
      rp: dto.rp,
      minStockLevel: dto.minStockLevel,
      status: ProductStatus.ACTIVE,
    });
  }

  async listForTenant(tenantId: string, filters: ProductListFilters = {}) {
    const filter: FilterQuery<ProductDocument> = { tenantId: new Types.ObjectId(tenantId) };

    if (filters.manufacturerId) {
      filter.manufacturerId = new Types.ObjectId(filters.manufacturerId);
    }
    if (filters.categoryId) {
      filter.categoryId = new Types.ObjectId(filters.categoryId);
    }
    if (filters.search) {
      filter.$or = [
        { name: { $regex: escapeRegex(filters.search), $options: 'i' } },
        { genericName: { $regex: escapeRegex(filters.search), $options: 'i' } },
        { barcode: { $regex: escapeRegex(filters.search), $options: 'i' } },
      ];
    }

    return this.productModel
      .find(filter)
      .populate('manufacturerId', 'name')
      .populate('categoryId', 'name')
      .sort({ name: 1 });
  }

  async findByBarcode(tenantId: string, barcode: string) {
    return this.productModel.findOne({ tenantId: new Types.ObjectId(tenantId), barcode });
  }

  async updateProduct(tenantId: string, id: string, dto: UpdateProductDto) {
    const product = await this.findById(tenantId, id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // A product never moves between branches; `dto.branchId` is ignored.
    const branchId = product.branchId.toString();

    if (dto.barcode !== undefined && dto.barcode !== product.barcode) {
      await this.assertBarcodeAvailable(tenantId, branchId, dto.barcode, id);
      product.barcode = dto.barcode;
    }
    if (dto.manufacturerId !== undefined && dto.manufacturerId !== product.manufacturerId.toString()) {
      await this.assertReferencesInTenant(tenantId, branchId, dto.manufacturerId);
    }

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.genericName !== undefined) product.genericName = dto.genericName;
    if (dto.manufacturerId !== undefined)
      product.manufacturerId = new Types.ObjectId(dto.manufacturerId);
    if (dto.categoryId !== undefined) {
      product.categoryId = dto.categoryId ? new Types.ObjectId(dto.categoryId) : undefined;
    }
    if (dto.unit !== undefined) product.unit = dto.unit;
    if (dto.packing !== undefined) product.packing = dto.packing;
    if (dto.tp !== undefined) product.tp = dto.tp;
    if (dto.cp !== undefined) product.cp = dto.cp;
    if (dto.rp !== undefined) product.rp = dto.rp;
    this.assertPriceRules(product);
    if (dto.minStockLevel !== undefined) product.minStockLevel = dto.minStockLevel;

    return product.save();
  }

  async setStatus(tenantId: string, id: string, status: ProductStatus) {
    const product = await this.findById(tenantId, id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    product.status = status;
    return product.save();
  }

  private async assertBarcodeAvailable(tenantId: string, branchId: string, barcode: string, excludeId?: string) {
    const existing = await this.productModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      branchId: new Types.ObjectId(branchId),
      barcode,
      ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}),
    });

    if (existing) {
      throw new ConflictException(`A product with barcode "${barcode}" already exists`);
    }
  }

  toProductResponse(product: ProductDocument): ProductType {
    const obj = product.toObject() as any;

    const manufacturerId =
      typeof obj.manufacturerId === 'object'
        ? obj.manufacturerId._id.toString()
        : obj.manufacturerId.toString();
    const manufacturer =
      typeof obj.manufacturerId === 'object' && obj.manufacturerId.name
        ? { id: manufacturerId, name: obj.manufacturerId.name }
        : undefined;

    let categoryId: string | undefined;
    let category: { id: string; name: string } | undefined;
    if (obj.categoryId) {
      categoryId =
        typeof obj.categoryId === 'object'
          ? obj.categoryId._id.toString()
          : obj.categoryId.toString();
      if (typeof obj.categoryId === 'object' && obj.categoryId.name) {
        category = { id: categoryId!, name: obj.categoryId.name };
      }
    }

    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId?.toString(),
      name: obj.name,
      genericName: obj.genericName,
      manufacturerId,
      manufacturer,
      categoryId,
      category,
      barcode: obj.barcode,
      unit: obj.unit,
      packing: obj.packing,
      tp: obj.tp,
      cp: obj.cp,
      rp: obj.rp,
      status: obj.status,
      minStockLevel: obj.minStockLevel,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
