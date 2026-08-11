import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from './schemas/tenant.schema';
import { TenantStatus } from '@medicore/shared-types';
import type { Tenant as TenantType } from '@medicore/shared-types';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
  ) {}

  async create(name: string): Promise<TenantDocument> {
    const slug = this.slugify(name);
    const existing = await this.tenantModel.findOne({ slug });
    if (existing) {
      throw new ConflictException('A tenant with a similar name already exists');
    }
    return this.tenantModel.create({ name, slug, status: TenantStatus.TRIAL });
  }

  findById(id: string) {
    return this.tenantModel.findById(id);
  }

  async findAll() {
    return this.tenantModel.find().sort({ createdAt: -1 });
  }

  async findBySlug(slug: string) {
    return this.tenantModel.findOne({ slug });
  }

  async createReserved(name: string, slug: string, status: TenantStatus) {
    const existing = await this.tenantModel.findOne({ slug });
    if (existing) {
      return existing;
    }
    return this.tenantModel.create({ name, slug, status });
  }

  async setStatus(id: string, status: TenantStatus) {
    const tenant = await this.tenantModel.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    tenant.status = status;
    return tenant.save();
  }

  toTenantResponse(tenant: TenantDocument): TenantType {
    const obj = tenant.toObject() as any;
    return {
      id: obj._id.toString(),
      name: obj.name,
      slug: obj.slug,
      status: obj.status,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private slugify(name: string): string {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}-${suffix}`;
  }
}
