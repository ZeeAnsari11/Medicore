import { Schema, Types } from 'mongoose';
import { tenantStorage } from './tenant-context';

const QUERY_HOOKS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'countDocuments',
  'distinct',
] as const;

/**
 * Resolves the tenant to enforce for the current async context.
 * Returns null inside the escape hatch; throws when no context exists so an
 * unscoped query can never run by accident.
 */
const resolveTenant = (modelName: string): Types.ObjectId | null => {
  const store = tenantStorage.getStore();
  if (store?.bypass) return null;
  if (!store?.tenantId) {
    throw new Error(
      `Unscoped query on "${modelName}": no tenant context. Wrap platform/bootstrap code in runWithoutTenantScope().`,
    );
  }
  return new Types.ObjectId(store.tenantId);
};

/**
 * Global Mongoose plugin: every model with a required `tenantId` gets it
 * ANDed into reads/updates/deletes/aggregates and stamped on creates, from the
 * request context only. A foreign tenantId in a filter simply matches nothing.
 */
export function tenantScopePlugin(schema: Schema): void {
  const tenantPath = schema.path('tenantId') as { isRequired?: boolean } | undefined;
  if (!tenantPath?.isRequired) return; // global or nullable-tenant (system) collections

  for (const hook of QUERY_HOOKS) {
    schema.pre(hook, function (this: any) {
      const tenantId = resolveTenant(this.model.modelName);
      if (!tenantId) return;
      const existing = this.getFilter().tenantId;
      if (existing === undefined) {
        // set (not $and) so upserts can still infer tenantId for the inserted document
        this.setQuery({ ...this.getFilter(), tenantId });
      } else if (String(existing) !== String(tenantId)) {
        this.and([{ tenantId }]); // conflicting filter matches nothing
      }
      const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
      if (update && typeof update === 'object') {
        delete update.tenantId;
        if (update.$set) delete update.$set.tenantId;
      }
    });
  }

  schema.pre('aggregate', function (this: any) {
    const tenantId = resolveTenant(this.model().modelName);
    if (tenantId) this.pipeline().unshift({ $match: { tenantId } });
  });

  schema.pre('validate', function (this: any, next) {
    if (!this.isNew) return next();
    try {
      const tenantId = resolveTenant(this.constructor.modelName);
      if (tenantId) {
        if (this.tenantId && String(this.tenantId) !== String(tenantId)) {
          return next(new Error('tenantId does not match the authenticated tenant'));
        }
        this.tenantId = tenantId;
      }
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  schema.pre('insertMany', function (this: any, next, docs: any) {
    try {
      const tenantId = resolveTenant(this.modelName);
      if (tenantId) {
        for (const doc of Array.isArray(docs) ? docs : [docs]) {
          if (doc.tenantId && String(doc.tenantId) !== String(tenantId)) {
            return next(new Error('tenantId does not match the authenticated tenant'));
          }
          doc.tenantId = tenantId;
        }
      }
      next();
    } catch (err) {
      next(err as Error);
    }
  });
}
