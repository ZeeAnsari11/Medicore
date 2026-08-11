import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';

/**
 * Base for every future tenant-owned collection (Product, Vendor, Purchase, …).
 * Every query is forced through `withTenant`, so a future service literally
 * cannot forget the tenantId filter and leak data across tenants — the only
 * way to query the model directly is to bypass this class entirely.
 *
 * `tenantId` here must always be the value from `AuthenticatedUser` (derived
 * server-side from the JWT in `JwtStrategy.validate`), never client input.
 */
export abstract class TenantScopedRepository<TDoc extends { tenantId: Types.ObjectId }> {
  protected constructor(protected readonly model: Model<TDoc>) {}

  protected withTenant(tenantId: string, filter: FilterQuery<TDoc> = {}): FilterQuery<TDoc> {
    return { ...filter, tenantId: new Types.ObjectId(tenantId) };
  }

  findAll(tenantId: string, filter: FilterQuery<TDoc> = {}) {
    return this.model.find(this.withTenant(tenantId, filter));
  }

  findById(tenantId: string, id: string) {
    return this.model.findOne(this.withTenant(tenantId, { _id: id }));
  }

  create(tenantId: string, doc: Omit<Partial<TDoc>, 'tenantId'>) {
    return this.model.create({ ...doc, tenantId: new Types.ObjectId(tenantId) });
  }

  updateById(tenantId: string, id: string, update: UpdateQuery<TDoc>) {
    return this.model.findOneAndUpdate(this.withTenant(tenantId, { _id: id }), update, {
      new: true,
    });
  }

  deleteById(tenantId: string, id: string) {
    return this.model.findOneAndDelete(this.withTenant(tenantId, { _id: id }));
  }
}
