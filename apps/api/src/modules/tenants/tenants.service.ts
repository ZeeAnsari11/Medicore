import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from './schemas/tenant.schema';
import { TenantStatus } from '@medicore/shared-types';

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
