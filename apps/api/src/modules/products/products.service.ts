import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
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
  constructor(@InjectModel(Product.name) private readonly productModel: Model<ProductDocument>) {
    super(productModel);
  }

  async createProduct(tenantId: string, dto: CreateProductDto) {
    if (dto.barcode) {
      await this.assertBarcodeAvailable(tenantId, dto.barcode);
    }

    return this.productModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      genericName: dto.genericName,
      manufacturerId: new Types.ObjectId(dto.manufacturerId),
      categoryId: dto.categoryId ? new Types.ObjectId(dto.categoryId) : undefined,
      barcode: dto.barcode,
      unit: dto.unit,
      packing: dto.packing,
      purchasePrice: dto.purchasePrice,
      salePrice: dto.salePrice,
      dealerPrice: dto.dealerPrice,
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
        { name: { $regex: filters.search, $options: 'i' } },
        { genericName: { $regex: filters.search, $options: 'i' } },
        { barcode: { $regex: filters.search, $options: 'i' } },
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

    if (dto.barcode !== undefined && dto.barcode !== product.barcode) {
      await this.assertBarcodeAvailable(tenantId, dto.barcode, id);
      product.barcode = dto.barcode;
    }

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.genericName !== undefined) product.genericName = dto.genericName;
    if (dto.manufacturerId !== undefined) product.manufacturerId = new Types.ObjectId(dto.manufacturerId);
    if (dto.categoryId !== undefined) {
      product.categoryId = dto.categoryId ? new Types.ObjectId(dto.categoryId) : undefined;
    }
    if (dto.unit !== undefined) product.unit = dto.unit;
    if (dto.packing !== undefined) product.packing = dto.packing;
    if (dto.purchasePrice !== undefined) product.purchasePrice = dto.purchasePrice;
    if (dto.salePrice !== undefined) product.salePrice = dto.salePrice;
    if (dto.dealerPrice !== undefined) product.dealerPrice = dto.dealerPrice;
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

  private async assertBarcodeAvailable(tenantId: string, barcode: string, excludeId?: string) {
    const existing = await this.productModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
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
      typeof obj.manufacturerId === 'object' ? obj.manufacturerId._id.toString() : obj.manufacturerId.toString();
    const manufacturer =
      typeof obj.manufacturerId === 'object' && obj.manufacturerId.name
        ? { id: manufacturerId, name: obj.manufacturerId.name }
        : undefined;

    let categoryId: string | undefined;
    let category: { id: string; name: string } | undefined;
    if (obj.categoryId) {
      categoryId = typeof obj.categoryId === 'object' ? obj.categoryId._id.toString() : obj.categoryId.toString();
      if (typeof obj.categoryId === 'object' && obj.categoryId.name) {
        category = { id: categoryId!, name: obj.categoryId.name };
      }
    }

    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      name: obj.name,
      genericName: obj.genericName,
      manufacturerId,
      manufacturer,
      categoryId,
      category,
      barcode: obj.barcode,
      unit: obj.unit,
      packing: obj.packing,
      purchasePrice: obj.purchasePrice,
      salePrice: obj.salePrice,
      dealerPrice: obj.dealerPrice,
      status: obj.status,
      minStockLevel: obj.minStockLevel,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
