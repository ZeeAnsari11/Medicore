import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Manufacturer, ManufacturerDocument } from './schemas/manufacturer.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import type { Manufacturer as ManufacturerType } from '@medicore/shared-types';

@Injectable()
export class ManufacturersService extends TenantScopedRepository<ManufacturerDocument> {
  constructor(
    @InjectModel(Manufacturer.name) private readonly manufacturerModel: Model<ManufacturerDocument>,
  ) {
    super(manufacturerModel);
  }

  async createManufacturer(tenantId: string, dto: CreateManufacturerDto) {
    const existing = await this.manufacturerModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
    });

    if (existing) {
      throw new ConflictException(`A manufacturer named "${dto.name}" already exists`);
    }

    return this.manufacturerModel.create({
      tenantId: new Types.ObjectId(tenantId),
      ...dto,
      isActive: true,
    });
  }

  async listForTenant(tenantId: string, search?: string) {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    return this.manufacturerModel.find(filter).sort({ name: 1 });
  }

  async updateManufacturer(tenantId: string, id: string, dto: UpdateManufacturerDto) {
    const manufacturer = await this.findById(tenantId, id);

    if (!manufacturer) {
      throw new NotFoundException('Manufacturer not found');
    }

    if (dto.name !== undefined) {
      const existing = await this.manufacturerModel.findOne({
        tenantId: new Types.ObjectId(tenantId),
        name: dto.name,
        _id: { $ne: new Types.ObjectId(id) },
      });

      if (existing) {
        throw new ConflictException(`A manufacturer named "${dto.name}" already exists`);
      }

      manufacturer.name = dto.name;
    }

    if (dto.country !== undefined) manufacturer.country = dto.country;
    if (dto.contactEmail !== undefined) manufacturer.contactEmail = dto.contactEmail;
    if (dto.contactPhone !== undefined) manufacturer.contactPhone = dto.contactPhone;
    if (dto.website !== undefined) manufacturer.website = dto.website;

    return manufacturer.save();
  }

  async setStatus(tenantId: string, id: string, isActive: boolean) {
    const manufacturer = await this.findById(tenantId, id);

    if (!manufacturer) {
      throw new NotFoundException('Manufacturer not found');
    }

    manufacturer.isActive = isActive;
    return manufacturer.save();
  }

  toManufacturerResponse(manufacturer: ManufacturerDocument): ManufacturerType {
    const obj = manufacturer.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      name: obj.name,
      country: obj.country,
      contactEmail: obj.contactEmail,
      contactPhone: obj.contactPhone,
      website: obj.website,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
