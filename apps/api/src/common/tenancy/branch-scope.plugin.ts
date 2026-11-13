import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Schema, SchemaOptions, Types } from 'mongoose';
import { BranchContext, tenantStorage } from './tenant-context';

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

/** Schemas opt in with `@Schema({ ..., ...BRANCH_SCOPED })`. */
export const BRANCH_SCOPED = { branchScoped: true } as SchemaOptions;

export const isBranchScoped = (schema: Schema): boolean => !!(schema.options as any)?.branchScoped;

/**
 * Branch to force onto a read/update/delete, or null for "no branch filter" (an admin viewing all
 * branches, or an escape hatch). Throws when no branch context exists so a branch-owned query can
 * never run unscoped by accident.
 */
const resolveBranch = (modelName: string): { ctx: BranchContext; branch: Types.ObjectId | null } | null => {
  const store = tenantStorage.getStore();
  if (store?.bypass || store?.branchBypass) return null;
  const ctx = store?.branch;
  if (!ctx) {
    throw new Error(
      `Unscoped query on "${modelName}": no branch context. Use runAsTenant()/runWithoutBranchScope() outside requests.`,
    );
  }
  if (ctx.selectedBranchId) return { ctx, branch: new Types.ObjectId(ctx.selectedBranchId) };
  if (!ctx.canSeeAll) throw new ForbiddenException('Your account is not assigned to a branch yet');
  return { ctx, branch: null };
};

/**
 * Branch context for a create, or null for the escape hatches. Unlike reads, the X-Branch-Id header
 * (`selectedBranchId` of an admin) plays no part here: an admin's new record carries the branchId in
 * its own body; a branch user's record always lands in their own branch.
 */
const resolveCreateContext = (modelName: string): BranchContext | null => {
  const store = tenantStorage.getStore();
  if (store?.bypass || store?.branchBypass) return null;
  if (!store?.branch) {
    throw new Error(
      `Unscoped create on "${modelName}": no branch context. Use runAsTenant()/runWithoutBranchScope() outside requests.`,
    );
  }
  return store.branch;
};

/** Stamps/validates `doc.branchId` for a create. Admins must name it; branch users are forced to theirs. */
function applyCreateBranch(doc: any, ctx: BranchContext): void {
  if (ctx.canSeeAll) {
    if (!doc.branchId) {
      throw new BadRequestException({
        statusCode: 400,
        message: ['branchId should not be empty'],
        error: 'Bad Request',
      });
    }
    return;
  }
  if (!ctx.selectedBranchId) throw new ForbiddenException('Your account is not assigned to a branch yet');
  if (doc.branchId && String(doc.branchId) !== String(ctx.selectedBranchId)) {
    throw new ForbiddenException('You do not have access to that branch');
  }
  doc.branchId = new Types.ObjectId(ctx.selectedBranchId);
}

/** An admin's explicit branch must be an active branch of their own tenant. */
async function assertAdminBranch(doc: any, ctx: BranchContext, tenantId: Types.ObjectId | undefined) {
  const id = String(doc.branchId);
  if (ctx.validBranchIds?.has(id)) return;
  const Branch = (doc.constructor as any).db.model('Branch');
  const branch = await Branch.findOne({ _id: id, ...(tenantId ? { tenantId } : {}) })
    .select('isActive')
    .lean()
    .exec();
  if (!branch) throw new ForbiddenException('Branch does not belong to your tenant');
  if (branch.isActive === false) throw new ForbiddenException('Branch is inactive; no new documents can be created in it');
  (ctx.validBranchIds ??= new Set()).add(id);
}

/**
 * Global Mongoose plugin, registered after tenantScopePlugin. For every `branchScoped` schema:
 * - branch users are forced to their branch on every read/update/delete/count/aggregate; a record
 *   from another branch is simply not found (404);
 * - admins get the selected branch applied unless the query names a branch explicitly; "all
 *   branches" adds no filter (the tenant filter already bounds it);
 * - creates never use the X-Branch-Id header. A branch user is forced to their own branch (another
 *   branchId is a 403); an admin must send a branchId (400 otherwise) that is an active branch of
 *   their tenant.
 */
export function branchScopePlugin(schema: Schema): void {
  if (!isBranchScoped(schema)) return;

  for (const hook of QUERY_HOOKS) {
    schema.pre(hook, function (this: any) {
      const r = resolveBranch(this.model.modelName);
      if (!r?.branch) return;
      const existing = this.getFilter().branchId;
      if (existing === undefined) {
        this.setQuery({ ...this.getFilter(), branchId: r.branch });
      } else if (!r.ctx.canSeeAll && String(existing) !== String(r.branch)) {
        this.and([{ branchId: r.branch }]); // conflicting filter matches nothing
      }
      const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
      if (update && typeof update === 'object') {
        delete update.branchId;
        if (update.$set) delete update.$set.branchId;
      }
    });
  }

  schema.pre('aggregate', function (this: any) {
    const r = resolveBranch(this.model().modelName);
    if (!r?.branch) return;
    const pipeline = this.pipeline();
    // Right after the tenant $match (first stage), so it is applied before any join or group.
    const at = pipeline[0]?.$match?.tenantId !== undefined ? 1 : 0;
    const named = pipeline[at]?.$match?.branchId !== undefined;
    if (named && r.ctx.canSeeAll) return;
    pipeline.splice(at, 0, { $match: { branchId: r.branch } });
  });

  schema.pre('validate', async function (this: any) {
    if (!this.isNew) return;
    const ctx = resolveCreateContext(this.constructor.modelName);
    if (!ctx) return;
    applyCreateBranch(this, ctx);
    if (ctx.canSeeAll || !ctx.validBranchIds?.has(String(this.branchId))) {
      await assertAdminBranch(this, ctx, this.tenantId); // inactive branches block everyone
    }
  });

  schema.pre('insertMany', async function (this: any, next, docs: any) {
    try {
      const ctx = resolveCreateContext(this.modelName);
      if (!ctx) return next();
      for (const doc of Array.isArray(docs) ? docs : [docs]) applyCreateBranch(doc, ctx);
      next();
    } catch (err) {
      next(err as Error);
    }
  });
}
