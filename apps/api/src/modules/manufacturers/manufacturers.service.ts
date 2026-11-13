import { escapeRegex } from '../../common/utils/escape-regex';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Manufacturer, ManufacturerDocument } from './schemas/manufacturer.schema';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { TenantScopedRepository } from '../../common/database/tenant-scoped.repository';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import type { Manufacturer as ManufacturerType } from '@medicore/shared-types';

@Injectable()
export class ManufacturersService extends TenantScopedRepository<ManufacturerDocument> {
  constructor(
    @InjectModel(Manufacturer.name) private readonly manufacturerModel: Model<ManufacturerDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {
    super(manufacturerModel);
  }

  /** Manufacturers are not plugin-validated, so an explicit branch is checked here (tenant, active). */
  private async assertBranchUsable(tenantId: string, branchId: string) {
    const branch = await this.branchModel
      .findOne({ _id: new Types.ObjectId(branchId), tenantId: new Types.ObjectId(tenantId) })
      .select('isActive')
      .lean();
    if (!branch) throw new ForbiddenException('Branch does not belong to your tenant');
    if (branch.isActive === false) {
      throw new ForbiddenException('Branch is inactive; no new documents can be created in it');
    }
  }

  async createManufacturer(tenantId: string, dto: CreateManufacturerDto) {
    if (dto.branchId) await this.assertBranchUsable(tenantId, dto.branchId);
    const existing = await this.manufacturerModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
    });

    if (existing) {
      throw new ConflictException(`A manufacturer named "${dto.name}" already exists`);
    }

    const { alsoCreateVendor, ...manufacturerFields } = dto;
    const tenantObjectId = new Types.ObjectId(tenantId);

    if (!alsoCreateVendor) {
      return this.manufacturerModel.create({
        tenantId: tenantObjectId,
        ...manufacturerFields,
        branchId: manufacturerFields.branchId ? new Types.ObjectId(manufacturerFields.branchId) : undefined,
        isActive: true,
      });
    }

    // The same company is also a vendor: create both or neither.
    const existingVendor = await this.vendorModel.findOne({
      tenantId: tenantObjectId,
      branchId: new Types.ObjectId(dto.branchId),
      company: dto.name,
    });
    if (existingVendor) {
      throw new ConflictException(`A vendor named "${dto.name}" already exists`);
    }

    const session = await this.connection.startSession();
    try {
      let manufacturer: ManufacturerDocument | null = null;
      await session.withTransaction(async () => {
        [manufacturer] = await this.manufacturerModel.create(
          [{ tenantId: tenantObjectId, ...manufacturerFields, branchId: new Types.ObjectId(dto.branchId), isActive: true }],
          { session },
        );
        await this.vendorModel.create(
          [
            {
              tenantId: tenantObjectId,
              branchId: new Types.ObjectId(dto.branchId),
              company: dto.name,
              contactPhone: dto.contactPhone,
              isActive: true,
            },
          ],
          { session },
        );
      });
      return manufacturer!;
    } finally {
      await session.endSession();
    }
  }

  async listForTenant(tenantId: string, search?: string) {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (search) {
      filter.name = { $regex: escapeRegex(search), $options: 'i' };
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

    if (dto.branchId !== undefined && dto.branchId !== String(manufacturer.branchId)) {
      await this.assertBranchUsable(tenantId, dto.branchId);
      manufacturer.branchId = new Types.ObjectId(dto.branchId);
    }
    if (dto.country !== undefined) manufacturer.country = dto.country;
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
      branchId: obj.branchId?.toString(),
      country: obj.country,
      contactPhone: obj.contactPhone,
      website: obj.website,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
