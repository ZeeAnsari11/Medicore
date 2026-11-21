import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City, CityDocument } from './schemas/city.schema';
import { Territory, TerritoryDocument } from './schemas/territory.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { CreateCityDto, CreateTerritoryDto, UpdateCityDto, UpdateTerritoryDto } from './dto/location.dto';
import type { City as CityType, Territory as TerritoryType } from '@medicore/shared-types';

const keyOf = (name: string) => name.trim().toLowerCase();
const isDuplicateKey = (err: unknown) => (err as { code?: number }).code === 11000;

/**
 * Each branch's city and territory lists. Customers keep the names as plain strings, so renaming here also
 * renames them on the customers that use it.
 */
@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
    @InjectModel(Territory.name) private readonly territoryModel: Model<TerritoryDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
  ) {}

  private tenant(tenantId: string) {
    return new Types.ObjectId(tenantId);
  }

  /** `branchId` null = every branch the caller may see (the branch plugin still pins branch users to their own). */
  listCities(tenantId: string, branchId: string | null) {
    const filter: Record<string, unknown> = { tenantId: this.tenant(tenantId) };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    return this.cityModel.find(filter).sort({ name: 1 });
  }

  listTerritories(tenantId: string, branchId: string | null, cityId?: string) {
    const filter: Record<string, unknown> = { tenantId: this.tenant(tenantId) };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    if (cityId) filter.cityId = new Types.ObjectId(cityId);
    return this.territoryModel.find(filter).sort({ name: 1 });
  }

  /** `branchId` is the resolved branch of the new city (see resolveCreateBranch). */
  async createCity(tenantId: string, branchId: string, dto: CreateCityDto) {
    try {
      return await this.cityModel.create({
        tenantId: this.tenant(tenantId),
        branchId: new Types.ObjectId(branchId),
        name: dto.name,
        nameKey: keyOf(dto.name),
        isActive: true,
      });
    } catch (err) {
      throw isDuplicateKey(err) ? new ConflictException(`A city named "${dto.name}" already exists`) : err;
    }
  }

  private async cityOrFail(tenantId: string, id: string, branchId?: string) {
    const filter: Record<string, unknown> = { _id: id, tenantId: this.tenant(tenantId) };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    const city = await this.cityModel.findOne(filter);
    if (!city) throw new NotFoundException('City not found');
    return city;
  }

  async updateCity(tenantId: string, id: string, dto: UpdateCityDto) {
    const city = await this.cityOrFail(tenantId, id);
    const oldName = city.name;
    if (dto.isActive !== undefined) city.isActive = dto.isActive;
    if (dto.name !== undefined) {
      city.name = dto.name;
      city.nameKey = keyOf(dto.name);
    }
    try {
      await city.save();
    } catch (err) {
      throw isDuplicateKey(err) ? new ConflictException(`A city named "${dto.name}" already exists`) : err;
    }
    if (city.name !== oldName) {
      await this.customerModel.updateMany(
        { tenantId: this.tenant(tenantId), branchId: city.branchId, city: oldName },
        { $set: { city: city.name } },
      );
    }
    return city;
  }

  async createTerritory(tenantId: string, dto: CreateTerritoryDto) {
    const city = await this.cityOrFail(tenantId, dto.cityId, dto.branchId);
    try {
      return await this.territoryModel.create({
        tenantId: this.tenant(tenantId),
        branchId: city.branchId,
        cityId: new Types.ObjectId(dto.cityId),
        name: dto.name,
        nameKey: keyOf(dto.name),
        isActive: true,
      });
    } catch (err) {
      throw isDuplicateKey(err) ? new ConflictException(`This city already has a territory named "${dto.name}"`) : err;
    }
  }

  async updateTerritory(tenantId: string, id: string, dto: UpdateTerritoryDto) {
    const territory = await this.territoryModel.findOne({ _id: id, tenantId: this.tenant(tenantId) });
    if (!territory) throw new NotFoundException('Territory not found');
    const oldName = territory.name;
    if (dto.isActive !== undefined) territory.isActive = dto.isActive;
    if (dto.name !== undefined) {
      territory.name = dto.name;
      territory.nameKey = keyOf(dto.name);
    }
    try {
      await territory.save();
    } catch (err) {
      throw isDuplicateKey(err) ? new ConflictException(`This city already has a territory named "${dto.name}"`) : err;
    }
    if (territory.name !== oldName) {
      const city = await this.cityModel.findOne({ _id: territory.cityId, tenantId: this.tenant(tenantId), branchId: territory.branchId });
      if (city) {
        await this.customerModel.updateMany(
          { tenantId: this.tenant(tenantId), branchId: territory.branchId, city: city.name, territory: oldName },
          { $set: { territory: territory.name } },
        );
      }
    }
    return territory;
  }

  /**
   * Makes sure the city (and the territory under it) exist in the branch's lists and returns their stored spelling, so a
   * customer typed as "kasur" is saved as "Kasur". Lets old clients and imports keep sending free text.
   */
  async ensure(tenantId: string, branchId: string, cityName: string, territoryName?: string): Promise<{ city: string; territory?: string }> {
    const tenant = this.tenant(tenantId);
    const branch = new Types.ObjectId(branchId);
    const city = await this.upsert(this.cityModel, { tenantId: tenant, branchId: branch, nameKey: keyOf(cityName) }, { name: cityName.trim(), isActive: true });
    if (!territoryName?.trim()) return { city: city.name };
    const territory = await this.upsert(
      this.territoryModel,
      { tenantId: tenant, branchId: branch, cityId: city._id, nameKey: keyOf(territoryName) },
      { name: territoryName.trim(), isActive: true },
    );
    return { city: city.name, territory: territory.name };
  }

  private async upsert(model: Model<any>, filter: Record<string, unknown>, onInsert: Record<string, unknown>): Promise<{ name: string; _id: Types.ObjectId }> {
    const options = { upsert: true, new: true } as const;
    try {
      return await model.findOneAndUpdate(filter, { $setOnInsert: onInsert }, options);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Two requests created it at the same moment: read the winner.
      const winner = await model.findOne(filter);
      if (!winner) throw err;
      return winner;
    }
  }

  toCityResponse(city: CityDocument): CityType {
    const obj = city.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      name: obj.name,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  toTerritoryResponse(territory: TerritoryDocument): TerritoryType {
    const obj = territory.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      cityId: obj.cityId.toString(),
      name: obj.name,
      isActive: obj.isActive,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
