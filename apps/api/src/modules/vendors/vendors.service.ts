import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vendor, VendorDocument } from './schemas/vendor.schema';
import { VendorProduct, VendorProductDocument } from './schemas/vendor-product.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
import type { Vendor as VendorType, VendorProduct as VendorProductType } from '@medicore/shared-types';

@Injectable()
export class VendorsService extends TenantScopedRepository<VendorDocument> {
  constructor(
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(VendorProduct.name) private readonly vendorProductModel: Model<VendorProductDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {
    super(vendorModel);
  }

  async createVendor(tenantId: string, dto: CreateVendorDto) {
    const existing = await this.vendorModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      company: dto.company,
    });

    if (existing) {
      throw new ConflictException(`A vendor named "${dto.company}" already exists`);
    }

    return this.vendorModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
      isActive: true,
    });
  }

  /**
   * manufacturerId filters via a query-time join through VendorProduct ->
   * Product.manufacturerId, since Vendor itself carries no manufacturer field.
   */
  async listForTenant(tenantId: string, manufacturerId?: string) {
    if (!manufacturerId) {
      return this.vendorModel.find({ tenantId: new Types.ObjectId(tenantId) }).sort({ company: 1 });
    }

    const productIds = await this.productModel
      .find({ tenantId: new Types.ObjectId(tenantId), manufacturerId: new Types.ObjectId(manufacturerId) })
      .distinct('_id');

    const vendorIds = await this.vendorProductModel
      .find({ tenantId: new Types.ObjectId(tenantId), productId: { $in: productIds } })
      .distinct('vendorId');

    return this.vendorModel
      .find({ tenantId: new Types.ObjectId(tenantId), _id: { $in: vendorIds } })
      .sort({ company: 1 });
  }

  async updateVendor(tenantId: string, id: string, dto: UpdateVendorDto) {
    const vendor = await this.findById(tenantId, id);

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (dto.company !== undefined) {
      const existing = await this.vendorModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        company: dto.company,
        _id: { $ne: new Types.ObjectId(id) },
      });

      if (existing) {
        throw new ConflictException(`A vendor named "${dto.company}" already exists`);
      }

      vendor.company = dto.company;
    }

    if (dto.distributorType !== undefined) vendor.distributorType = dto.distributorType;
    if (dto.contactName !== undefined) vendor.contactName = dto.contactName;
    if (dto.contactPhone !== undefined) vendor.contactPhone = dto.contactPhone;
    if (dto.contactEmail !== undefined) vendor.contactEmail = dto.contactEmail;
    if (dto.address !== undefined) vendor.address = dto.address;

    return vendor.save();
  }

  async setStatus(tenantId: string, id: string, isActive: boolean) {
    const vendor = await this.findById(tenantId, id);

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    vendor.isActive = isActive;
    return vendor.save();
  }

  // --- VendorProduct (vendor-specific pricing join) ---

  async addVendorProduct(tenantId: string, dto: CreateVendorProductDto) {
    const existing = await this.vendorProductModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      vendorId: new Types.ObjectId(dto.vendorId),
      productId: new Types.ObjectId(dto.productId),
    });

    if (existing) {
      throw new ConflictException('This vendor is already linked to this product');
    }

    if (dto.isPreferred) {
      await this.unsetExistingPreferred(tenantId, dto.productId);
    }

    return this.vendorProductModel.create({
      tenantId: new Types.ObjectId(tenantId),
      vendorId: new Types.ObjectId(dto.vendorId),
      productId: new Types.ObjectId(dto.productId),
      vendorSku: dto.vendorSku,
      purchasePrice: dto.purchasePrice,
      isPreferred: dto.isPreferred ?? false,
      isActive: true,
    });
  }

  async listVendorProductsForProduct(tenantId: string, productId: string) {
    return this.vendorProductModel
      .find({ tenantId: new Types.ObjectId(tenantId), productId: new Types.ObjectId(productId) })
      .populate('vendorId', 'company')
      .sort({ isPreferred: -1, purchasePrice: 1 });
  }

  async listVendorProductsForVendor(tenantId: string, vendorId: string) {
    return this.vendorProductModel
      .find({ tenantId: new Types.ObjectId(tenantId), vendorId: new Types.ObjectId(vendorId) })
      .populate('productId', 'name')
      .sort({ createdAt: -1 });
  }

  async updateVendorProduct(tenantId: string, id: string, dto: UpdateVendorProductDto) {
    const link = await this.vendorProductModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!link) {
      throw new NotFoundException('Vendor product link not found');
    }

    if (dto.vendorSku !== undefined) link.vendorSku = dto.vendorSku;
    if (dto.purchasePrice !== undefined) link.purchasePrice = dto.purchasePrice;
    if (dto.isActive !== undefined) link.isActive = dto.isActive;

    if (dto.isPreferred !== undefined) {
      if (dto.isPreferred) {
        await this.unsetExistingPreferred(tenantId, link.productId.toString(), id);
      }
      link.isPreferred = dto.isPreferred;
    }

    return link.save();
  }

  async deleteVendorProduct(tenantId: string, id: string) {
    const link = await this.vendorProductModel.findOne({
      _id: new Types.ObjectId(id),
      tenantId: new Types.ObjectId(tenantId),
    });

    if (!link) {
      throw new NotFoundException('Vendor product link not found');
    }

    await this.vendorProductModel.deleteOne({ _id: link._id });
  }

  private async unsetExistingPreferred(tenantId: string, productId: string, excludeId?: string) {
    await this.vendorProductModel.updateMany(
      {
        tenantId: new Types.ObjectId(tenantId),
        productId: new Types.ObjectId(productId),
        isPreferred: true,
        ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}),
      },
      { $set: { isPreferred: false } },
    );
  }

  toVendorResponse(vendor: VendorDocument): VendorType {
    const obj = vendor.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      company: obj.company,
      distributorType: obj.distributorType,
      contactName: obj.contactName,
      contactPhone: obj.contactPhone,
      contactEmail: obj.contactEmail,
      address: obj.address,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  toVendorProductResponse(link: VendorProductDocument): VendorProductType {
    const obj = link.toObject() as any;

    let vendorId: string;
    let vendor: { id: string; company: string } | undefined;
    if (typeof obj.vendorId === 'object') {
      vendorId = obj.vendorId._id.toString();
      if (obj.vendorId.company) vendor = { id: vendorId, company: obj.vendorId.company };
    } else {
      vendorId = obj.vendorId.toString();
    }

    let productId: string;
    let product: { id: string; name: string } | undefined;
    if (typeof obj.productId === 'object') {
      productId = obj.productId._id.toString();
      if (obj.productId.name) product = { id: productId, name: obj.productId.name };
    } else {
      productId = obj.productId.toString();
    }

    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      vendorId,
      vendor,
      productId,
      product,
      vendorSku: obj.vendorSku,
      purchasePrice: obj.purchasePrice,
      isPreferred: obj.isPreferred,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
