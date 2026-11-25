import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AccountType, NormalBalance } from '@medicore/shared-types';
import type { ExpenseCategory as ExpenseCategoryType } from '@medicore/shared-types';
import { runWithoutBranchScope } from '../../common/tenancy/tenant-context';
import { escapeRegex } from '../../common/utils/escape-regex';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { ExpenseCategory, ExpenseCategoryDocument } from './schemas/expense-category.schema';
import { Account, AccountDocument } from './schemas/account.schema';
import { Expense, ExpenseDocument } from './schemas/expense.schema';
import { AccountsService } from './accounts.service';
import { nextExpenseAccountCode } from './expense-account-code';
import type {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

/** Every branch has this category and sub-category from the start (for the difference between what was sold and collected). */
export const DEFAULT_CATEGORY = 'Difference';
export const DEFAULT_SUB_CATEGORY = 'Sales Difference';

@Injectable()
export class ExpenseCategoriesService implements OnModuleInit {
  private readonly logger = new Logger(ExpenseCategoriesService.name);

  constructor(
    @InjectModel(ExpenseCategory.name)
    private readonly categoryModel: Model<ExpenseCategoryDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<ExpenseDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly accountsService: AccountsService,
  ) {}

  /**
   * Categories used to be unique per tenant; they are now unique per branch, so the two old unique indexes would block
   * the same name in a second branch. Dropped once; a missing index (new database) is fine.
   */
  async onModuleInit() {
    for (const name of ['tenantId_1_parentId_1_nameLower_1', 'tenantId_1_accountId_1']) {
      try {
        await this.categoryModel.collection.dropIndex(name);
        this.logger.log(`Dropped legacy index ${name}`);
      } catch {
        // Not there (fresh database or already dropped).
      }
    }
  }

  private activeBranches(tenantOid: Types.ObjectId) {
    return this.branchModel
      .find({ tenantId: tenantOid, isActive: { $ne: false } })
      .select('name isMain')
      .lean();
  }

  /**
   * Keeps the main categories in step with the expense accounts, lazily and idempotently (nothing to migrate):
   * - categories from before branches mattered move to the main branch;
   * - the built-in expense accounts (Operating Expenses, ...) are a category in every branch;
   * - an expense account nobody has made a category for is one in every branch.
   * A category a user makes belongs to the one branch they made it in.
   */
  async ensureMainCategories(tenantId: string): Promise<void> {
    // One run per tenant at a time, so two page loads cannot both create the default category or its account.
    const running = this.ensuring.get(tenantId);
    if (running) return running;
    const job = this.doEnsureMainCategories(tenantId).finally(() => this.ensuring.delete(tenantId));
    this.ensuring.set(tenantId, job);
    return job;
  }

  private readonly ensuring = new Map<string, Promise<void>>();

  /**
   * Every active branch has the default category (Difference) with its sub-category (Sales Difference): created the
   * first time the branch is seen, which is as soon as anything loads categories after it was made.
   */
  private async ensureDefaultCategories(
    tenantOid: Types.ObjectId,
    branches: Array<{ _id: Types.ObjectId }>,
  ) {
    const mains = await this.categoryModel
      .find({ tenantId: tenantOid, parentId: null, nameLower: DEFAULT_CATEGORY.toLowerCase() })
      .select('branchId isDefault')
      .lean();
    const mainByBranch = new Map(mains.map((c) => [String(c.branchId), c]));
    const missingBranches = branches.filter((b) => !mainByBranch.has(String(b._id)));
    if (missingBranches.length > 0) {
      const account = await this.accountForName(tenantOid, DEFAULT_CATEGORY);
      try {
        await this.categoryModel.insertMany(
          missingBranches.map((b) => ({
            tenantId: tenantOid,
            branchId: b._id,
            name: DEFAULT_CATEGORY,
            nameLower: DEFAULT_CATEGORY.toLowerCase(),
            parentId: null,
            accountId: String(account._id),
            isActive: true,
            isDefault: true,
          })),
          { ordered: false },
        );
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
    }
    // A Difference category a user made before this existed becomes the default one.
    await this.categoryModel.updateMany(
      {
        tenantId: tenantOid,
        parentId: null,
        nameLower: DEFAULT_CATEGORY.toLowerCase(),
        isDefault: { $ne: true },
      },
      { $set: { isDefault: true, isActive: true } },
    );

    const defaults = await this.categoryModel
      .find({ tenantId: tenantOid, parentId: null, nameLower: DEFAULT_CATEGORY.toLowerCase() })
      .select('branchId')
      .lean();
    const subs = await this.categoryModel
      .find({
        tenantId: tenantOid,
        parentId: { $in: defaults.map((c) => String(c._id)) },
        nameLower: DEFAULT_SUB_CATEGORY.toLowerCase(),
      })
      .select('parentId')
      .lean();
    const hasSub = new Set(subs.map((s) => s.parentId));
    const missingSubs = defaults.filter((c) => !hasSub.has(String(c._id)));
    if (missingSubs.length > 0) {
      try {
        await this.categoryModel.insertMany(
          missingSubs.map((c) => ({
            tenantId: tenantOid,
            branchId: c.branchId,
            name: DEFAULT_SUB_CATEGORY,
            nameLower: DEFAULT_SUB_CATEGORY.toLowerCase(),
            parentId: String(c._id),
            isActive: true,
            isDefault: true,
          })),
          { ordered: false },
        );
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
    }
    await this.categoryModel.updateMany(
      {
        tenantId: tenantOid,
        parentId: { $in: defaults.map((c) => String(c._id)) },
        nameLower: DEFAULT_SUB_CATEGORY.toLowerCase(),
        isDefault: { $ne: true },
      },
      { $set: { isDefault: true, isActive: true } },
    );
  }

  private async doEnsureMainCategories(tenantId: string): Promise<void> {
    const tenantOid = new Types.ObjectId(tenantId);
    const branches = await this.activeBranches(tenantOid);
    if (branches.length === 0) return;
    const mainBranch = branches.find((b) => b.isMain) ?? branches[0];
    await this.categoryModel.updateMany(
      { tenantId: tenantOid, branchId: { $exists: false } },
      { $set: { branchId: mainBranch._id } },
    );
    await this.ensureDefaultCategories(tenantOid, branches);

    const accounts = (await this.accountsService.list(tenantId)).filter(
      (a) => a.type === AccountType.EXPENSE && a.isActive && a.systemKey !== 'COGS',
    );
    if (accounts.length === 0) return;
    const mains = await this.categoryModel
      .find({
        tenantId: tenantOid,
        parentId: null,
        accountId: { $in: accounts.map((a) => String(a._id)) },
      })
      .select('accountId branchId')
      .lean();
    const have = new Set(mains.map((c) => `${c.accountId}:${String(c.branchId)}`));
    const used = new Set(mains.map((c) => c.accountId));

    const missing: Array<Record<string, unknown>> = [];
    for (const a of accounts) {
      const id = String(a._id);
      if (!a.isSystemAccount && used.has(id)) continue;
      for (const b of branches) {
        if (have.has(`${id}:${String(b._id)}`)) continue;
        missing.push({
          tenantId: tenantOid,
          branchId: b._id,
          name: a.name,
          nameLower: a.name.toLowerCase(),
          parentId: null,
          accountId: id,
          isActive: true,
        });
      }
    }
    if (missing.length === 0) return;
    try {
      await this.categoryModel.insertMany(missing, { ordered: false });
    } catch (e) {
      // A concurrent load already created it, or two accounts share a name: either way the rest were inserted.
      if (!isDuplicateKey(e)) throw e;
    }
  }

  /** Main categories with their sub-categories and how much was spent on each (limited to a branch when given). */
  async list(tenantId: string, branchId: string | null): Promise<ExpenseCategoryType[]> {
    await this.ensureMainCategories(tenantId);
    const tenantOid = new Types.ObjectId(tenantId);
    const scope: Record<string, unknown> = branchId
      ? { branchId: new Types.ObjectId(branchId) }
      : {};
    const match = { tenantId: tenantOid, deletedAt: null, ...scope };

    const [categories, accounts, branches, byCategory, byLegacyAccount, bySub] = await Promise.all([
      this.categoryModel.find({ tenantId: tenantOid, ...scope }).lean(),
      this.accountModel
        .find({ tenantId: tenantOid, type: AccountType.EXPENSE })
        .select('isActive isSystemAccount')
        .lean(),
      this.branchModel.find({ tenantId: tenantOid }).select('name').lean(),
      // Spend of a main category: the expenses recorded under it, plus older ones recorded against its account alone
      // (before categories existed) in the same branch.
      this.expenseModel.aggregate<{ _id: string; count: number; total: number }>([
        { $match: { ...match, categoryId: { $type: 'string' } } },
        { $group: { _id: '$categoryId', count: { $sum: 1 }, total: { $sum: '$amount' } } },
      ]),
      this.expenseModel.aggregate<{
        _id: { a: string; b: Types.ObjectId };
        count: number;
        total: number;
      }>([
        { $match: { ...match, categoryId: { $exists: false } } },
        {
          $group: {
            _id: { a: '$expenseAccountId', b: '$branchId' },
            count: { $sum: 1 },
            total: { $sum: '$amount' },
          },
        },
      ]),
      this.expenseModel.aggregate<{ _id: string; count: number; total: number }>([
        { $match: { ...match, subCategoryId: { $type: 'string' } } },
        { $group: { _id: '$subCategoryId', count: { $sum: 1 }, total: { $sum: '$amount' } } },
      ]),
    ]);

    const accountById = new Map(accounts.map((a) => [String(a._id), a]));
    const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
    // An account is shared by same-named categories of different branches, so spend is counted per branch.
    const categoryUse = new Map(byCategory.map((r) => [r._id, r]));
    const legacyUse = new Map(byLegacyAccount.map((r) => [`${r._id.a}:${String(r._id.b)}`, r]));
    const subUse = new Map(bySub.map((r) => [r._id, r]));
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

    const subsOf = new Map<string, ExpenseCategoryType[]>();
    for (const c of categories.filter((c) => c.parentId).sort(byName)) {
      const use = subUse.get(String(c._id));
      const entry: ExpenseCategoryType = {
        id: String(c._id),
        name: c.name,
        parentId: c.parentId,
        branchId: String(c.branchId),
        branchName: branchName.get(String(c.branchId)),
        isSystem: !!c.isDefault,
        isActive: c.isActive,
        expenseCount: use?.count ?? 0,
        totalAmount: use?.total ?? 0,
      };
      subsOf.set(c.parentId!, [...(subsOf.get(c.parentId!) ?? []), entry]);
    }

    return categories
      .filter((c) => !c.parentId)
      .sort(
        (a, b) =>
          byName(a, b) ||
          String(branchName.get(String(a.branchId))).localeCompare(
            String(branchName.get(String(b.branchId))),
          ),
      )
      .map((c) => {
        const account = c.accountId ? accountById.get(c.accountId) : undefined;
        const own = categoryUse.get(String(c._id));
        const old = c.accountId ? legacyUse.get(`${c.accountId}:${String(c.branchId)}`) : undefined;
        const use = {
          count: (own?.count ?? 0) + (old?.count ?? 0),
          total: (own?.total ?? 0) + (old?.total ?? 0),
        };
        return {
          id: String(c._id),
          name: c.name,
          parentId: null,
          branchId: String(c.branchId),
          branchName: branchName.get(String(c.branchId)),
          accountId: c.accountId,
          isSystem: !!account?.isSystemAccount || !!c.isDefault,
          // A main category whose account was deactivated can't take new expenses either.
          isActive: c.isActive && !!account?.isActive,
          expenseCount: use.count,
          totalAmount: use.total,
          subCategories: subsOf.get(String(c._id)) ?? [],
        };
      });
  }

  /** The expense account for a category name: the tenant's existing one of that name, else a new one. */
  private async accountForName(tenantOid: Types.ObjectId, name: string, session?: ClientSession) {
    const existing = await this.accountModel
      .findOne({
        tenantId: tenantOid,
        type: AccountType.EXPENSE,
        deletedAt: null,
        systemKey: { $ne: 'COGS' },
        name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      })
      .session(session ?? null);
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        await existing.save({ session });
      }
      return existing;
    }
    const codes = await this.accountModel
      .distinct('code', { tenantId: tenantOid })
      .session(session ?? null);
    const [account] = await this.accountModel.create(
      [
        {
          tenantId: tenantOid,
          code: nextExpenseAccountCode(codes),
          name,
          type: AccountType.EXPENSE,
          normalBalance: NormalBalance.DEBIT,
          isSystemAccount: false,
          isActive: true,
        },
      ],
      session ? { session } : {},
    );
    return account;
  }

  /**
   * `branchId` is the branch of a new main category (already resolved for the caller); a sub-category takes its
   * main category's branch, so it is ignored for one.
   */
  async create(
    tenantId: string,
    dto: CreateExpenseCategoryDto,
    branchId?: string,
  ): Promise<ExpenseCategoryDocument> {
    await this.ensureMainCategories(tenantId);
    const tenantOid = new Types.ObjectId(tenantId);
    const name = dto.name.trim();
    const nameLower = name.toLowerCase();

    if (dto.parentId) {
      const parent = await this.categoryModel.findOne({ _id: dto.parentId, tenantId: tenantOid });
      if (!parent) throw new NotFoundException('Main category not found');
      if (parent.parentId)
        throw new BadRequestException('A sub-category cannot have sub-categories');
      if (!parent.isActive)
        throw new BadRequestException('Activate the main category before adding to it');
      try {
        return await this.categoryModel.create({
          tenantId: tenantOid,
          branchId: parent.branchId,
          name,
          nameLower,
          parentId: String(parent._id),
          isActive: true,
        });
      } catch (e) {
        if (isDuplicateKey(e))
          throw new ConflictException(`"${name}" already exists in this category`);
        throw e;
      }
    }

    if (!branchId) throw new BadRequestException('Choose the branch this category belongs to');
    const branch = await this.branchModel
      .findOne({ _id: new Types.ObjectId(branchId), tenantId: tenantOid })
      .select('isActive')
      .lean();
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.isActive === false) throw new BadRequestException('That branch is inactive');

    const session = await this.connection.startSession();
    try {
      let created: ExpenseCategoryDocument | undefined;
      await session.withTransaction(async () => {
        const account = await this.accountForName(tenantOid, name, session);
        [created] = await this.categoryModel.create(
          [
            {
              tenantId: tenantOid,
              branchId: branch._id,
              name,
              nameLower,
              parentId: null,
              accountId: String(account._id),
              isActive: true,
            },
          ],
          { session },
        );
      });
      return created!;
    } catch (e) {
      if (isDuplicateKey(e)) throw new ConflictException(`"${name}" already exists in this branch`);
      throw e;
    } finally {
      await session.endSession();
    }
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategoryDocument> {
    await this.ensureMainCategories(tenantId);
    const tenantOid = new Types.ObjectId(tenantId);
    const category = await this.categoryModel.findOne({ _id: id, tenantId: tenantOid });
    if (!category) throw new NotFoundException('Category not found');
    const account = category.accountId
      ? await this.accountModel.findOne({ _id: category.accountId, tenantId: tenantOid })
      : null;
    const newName = dto.name?.trim();
    const renaming = newName !== undefined && newName !== category.name;
    if (category.isDefault && (renaming || dto.isActive === false)) {
      throw new BadRequestException(
        `"${category.name}" is a default category and cannot be renamed or deactivated`,
      );
    }
    if (account?.isSystemAccount && (renaming || dto.isActive === false)) {
      throw new BadRequestException(
        `"${category.name}" is a built-in category and cannot be renamed or deactivated`,
      );
    }

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (newName !== undefined) {
          category.name = newName;
          category.nameLower = newName.toLowerCase();
          if (account && renaming) {
            // The Profit & Loss line is the account's name. Other branches' categories may share it, so it is only
            // renamed in place when this is its only category; otherwise the category moves to the account of its
            // new name.
            const others = await this.categoryModel
              .countDocuments({
                tenantId: tenantOid,
                accountId: String(account._id),
                _id: { $ne: category._id },
              })
              .session(session);
            const target = await this.accountModel
              .findOne({
                tenantId: tenantOid,
                type: AccountType.EXPENSE,
                deletedAt: null,
                _id: { $ne: account._id },
                name: new RegExp(`^${escapeRegex(newName)}$`, 'i'),
              })
              .session(session);
            if (target) {
              target.isActive = true;
              await target.save({ session });
              category.accountId = String(target._id);
              if (others === 0 && !account.isSystemAccount) {
                account.isActive = false;
                await account.save({ session });
              }
            } else if (others === 0) {
              account.name = newName;
              await account.save({ session });
            } else {
              category.accountId = String(
                (await this.accountForName(tenantOid, newName, session))._id,
              );
            }
          }
        }
        if (dto.isActive !== undefined) {
          category.isActive = dto.isActive;
          const live = category.accountId
            ? await this.accountModel
                .findOne({ _id: category.accountId, tenantId: tenantOid })
                .session(session)
            : null;
          if (live) {
            if (dto.isActive) live.isActive = true;
            else {
              const stillUsed = await this.categoryModel
                .countDocuments({
                  tenantId: tenantOid,
                  accountId: String(live._id),
                  _id: { $ne: category._id },
                  isActive: true,
                })
                .session(session);
              if (stillUsed === 0 && !live.isSystemAccount) live.isActive = false;
            }
            await live.save({ session });
          }
        }
        await category.save({ session });
      });
      return category;
    } catch (e) {
      if (isDuplicateKey(e))
        throw new ConflictException(`"${dto.name}" already exists in this branch`);
      throw e;
    } finally {
      await session.endSession();
    }
  }

  async remove(tenantId: string, id: string) {
    await this.ensureMainCategories(tenantId);
    const tenantOid = new Types.ObjectId(tenantId);
    const category = await this.categoryModel.findOne({ _id: id, tenantId: tenantOid });
    if (!category) throw new NotFoundException('Category not found');
    const account = category.accountId
      ? await this.accountModel.findOne({ _id: category.accountId, tenantId: tenantOid })
      : null;
    if (category.isDefault) {
      throw new BadRequestException(
        `"${category.name}" is a default category and cannot be deleted`,
      );
    }
    if (account?.isSystemAccount) {
      throw new BadRequestException(
        `"${category.name}" is a built-in category and cannot be deleted`,
      );
    }

    if (
      !category.parentId &&
      (await this.categoryModel.exists({ tenantId: tenantOid, parentId: String(category._id) }))
    ) {
      throw new ConflictException('Delete its sub-categories first');
    }
    // Only this branch's expenses count (the account is shared with same-named categories of other branches), and
    // every user sees them whichever branch they are viewing.
    const used = await runWithoutBranchScope(() =>
      this.expenseModel.countDocuments({
        tenantId: tenantOid,
        deletedAt: null,
        ...(category.parentId
          ? { subCategoryId: String(category._id) }
          : {
              $or: [
                { categoryId: String(category._id) },
                {
                  categoryId: { $exists: false },
                  expenseAccountId: category.accountId,
                  branchId: category.branchId,
                },
              ],
            }),
      }),
    );
    if (used > 0)
      throw new ConflictException(`${used} expense(s) use this category; deactivate it instead`);

    await this.categoryModel.deleteOne({ _id: category._id, tenantId: tenantOid });
    // Otherwise the still-active account would turn straight back into a category on the next load; but other
    // branches' categories of the same name keep using it.
    if (account) {
      const others = await this.categoryModel.countDocuments({
        tenantId: tenantOid,
        accountId: String(account._id),
      });
      if (others === 0) {
        account.isActive = false;
        await account.save();
      }
    }
  }

  /**
   * The branch's default Difference > Sales Difference: where a cash receipt's written-off amount is booked (the
   * default category exists in every active branch, created on first use).
   */
  async defaultDifference(tenantId: string, branchId: string) {
    await this.ensureMainCategories(tenantId);
    const tenantOid = new Types.ObjectId(tenantId);
    const main = await this.categoryModel
      .findOne({
        tenantId: tenantOid,
        branchId: new Types.ObjectId(branchId),
        parentId: null,
        nameLower: DEFAULT_CATEGORY.toLowerCase(),
        isDefault: true,
      })
      .lean();
    const sub = main
      ? await this.categoryModel
          .findOne({
            tenantId: tenantOid,
            parentId: String(main._id),
            nameLower: DEFAULT_SUB_CATEGORY.toLowerCase(),
            isDefault: true,
          })
          .lean()
      : null;
    if (!main?.accountId || !sub) {
      throw new BadRequestException(`This branch has no ${DEFAULT_CATEGORY} > ${DEFAULT_SUB_CATEGORY} category`);
    }
    return { categoryId: String(main._id), subCategoryId: String(sub._id), accountId: main.accountId };
  }

  /**
   * What a new expense needs from its category: the account to post to and the names to show. The category must
   * belong to the branch the expense is recorded in.
   */
  async resolveForExpense(
    tenantId: string,
    categoryId: string,
    subCategoryId: string | undefined,
    branchId: string,
  ) {
    await this.ensureMainCategories(tenantId);
    const tenantOid = new Types.ObjectId(tenantId);
    const main = await this.categoryModel.findOne({
      _id: categoryId,
      tenantId: tenantOid,
      parentId: null,
    });
    if (!main?.accountId) throw new NotFoundException('Expense category not found');
    if (String(main.branchId) !== branchId) {
      throw new BadRequestException(`Category "${main.name}" belongs to another branch`);
    }
    if (!main.isActive) throw new BadRequestException(`Category "${main.name}" is inactive`);
    let sub: ExpenseCategoryDocument | null = null;
    if (subCategoryId) {
      sub = await this.categoryModel.findOne({
        _id: subCategoryId,
        tenantId: tenantOid,
        parentId: String(main._id),
      });
      if (!sub)
        throw new BadRequestException('That sub-category does not belong to the chosen category');
      if (!sub.isActive) throw new BadRequestException(`Sub-category "${sub.name}" is inactive`);
    }
    return { accountId: main.accountId, categoryName: main.name, subCategoryName: sub?.name };
  }
}
