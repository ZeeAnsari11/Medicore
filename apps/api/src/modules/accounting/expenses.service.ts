import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Expense, ExpenseDocument } from './schemas/expense.schema';
import { Account, AccountDocument } from './schemas/account.schema';
import { ExpenseCategory, ExpenseCategoryDocument } from './schemas/expense-category.schema';
import { Vendor, VendorDocument } from '../vendors/schemas/vendor.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { Tenant, TenantDocument } from '../tenants/schemas/tenant.schema';
import { rangeOf } from '../reports/ssr/tz';
import { ExpenseCategoriesService } from './expense-categories.service';
import type { ExpenseLedgerQueryDto } from './dto/expense-ledger-query.dto';
import { AccountingPostingService, type PostLineInput } from './accounting-posting.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { runWithoutBranchScope } from '../../common/tenancy/tenant-context';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { AccountType, JournalEntrySourceType } from '@medicore/shared-types';
import type { Expense as ExpenseType } from '@medicore/shared-types';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name) private readonly expenseModel: Model<ExpenseDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(ExpenseCategory.name) private readonly categoryModel: Model<ExpenseCategoryDocument>,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<VendorDocument>,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly postingService: AccountingPostingService,
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly sequenceService: SequenceService,
  ) {}

  /** One backfill per tenant at a time, so two page loads cannot number the same expenses twice. */
  private readonly numbering = new Map<string, Promise<void>>();

  /**
   * Gives every expense recorded before numbering existed its number, oldest first, so the list shows 1, 2, 3 ... per
   * tenant. Lazy and idempotent: a no-op once everything has one.
   */
  async ensureExpenseNumbers(tenantId: string): Promise<void> {
    const running = this.numbering.get(tenantId);
    if (running) return running;
    const job = (async () => {
      await runWithoutBranchScope(async () => {
        const tenantOid = new Types.ObjectId(tenantId);
        const unnumbered = await this.expenseModel
          .find({ tenantId: tenantOid, expenseSeq: { $exists: false } })
          .sort({ createdAt: 1, _id: 1 })
          .select('_id')
          .lean();
        for (const e of unnumbered) {
          const seq = await this.sequenceService.next(tenantId, null, 'expense');
          await this.expenseModel.updateOne({ _id: e._id, expenseSeq: { $exists: false } }, { $set: { expenseSeq: seq } });
        }
      });
    })().finally(() => this.numbering.delete(tenantId));
    this.numbering.set(tenantId, job);
    return job;
  }

  async listForTenant(tenantId: string, branchId: string | null) {
    await this.ensureExpenseNumbers(tenantId);
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      deletedAt: null,
    };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    return this.expenseModel.find(filter).sort({ expenseDate: -1 });
  }

  async createExpense(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<ExpenseDocument> {
    // Older expenses are numbered first, so a new one always comes after them.
    await this.ensureExpenseNumbers(tenantId);
    if (dto.categoryId && !dto.subCategoryId) throw new BadRequestException('Choose an Exp Sub Category');
    if (dto.subCategoryId && !dto.categoryId) throw new BadRequestException('Choose the category of that sub-category');
    // A category brings its own account; `expenseAccountId` alone is what older app builds send.
    const expenseAccountId = dto.categoryId
      ? (await this.categoriesService.resolveForExpense(tenantId, dto.categoryId, dto.subCategoryId, branchId)).accountId
      : dto.expenseAccountId;
    if (!expenseAccountId) throw new BadRequestException('Choose an expense category');

    const [expenseAccount, paymentAccount] = await Promise.all([
      this.accountModel.findOne({
        _id: expenseAccountId,
        tenantId: new Types.ObjectId(tenantId),
      }),
      this.accountModel.findOne({
        _id: dto.paymentAccountId,
        tenantId: new Types.ObjectId(tenantId),
      }),
    ]);
    if (!expenseAccount) throw new NotFoundException('Expense account not found');
    if (expenseAccount.type !== AccountType.EXPENSE || !expenseAccount.isActive) {
      throw new BadRequestException(`"${expenseAccount.name}" is not an active expense category`);
    }
    if (!paymentAccount) throw new NotFoundException('Payment account not found');

    const session = await this.connection.startSession();
    try {
      let result: ExpenseDocument | null = null;

      await session.withTransaction(async () => {
        const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date();

        const lines: PostLineInput[] = [
          {
            accountId: expenseAccount.id,
            debit: dto.amount,
            credit: 0,
            description: dto.description,
          },
          {
            accountId: paymentAccount.id,
            debit: 0,
            credit: dto.amount,
            description: dto.description,
          },
        ];

        const journalEntry = await this.postingService.postJournalEntry({
          tenantId,
          branchId,
          entryDate: expenseDate,
          sourceType: JournalEntrySourceType.EXPENSE,
          description: dto.description,
          lines,
          createdBy: userId,
          session,
        });

        const [created] = await this.expenseModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              expenseSeq: await this.sequenceService.next(tenantId, null, 'expense', session),
              expenseAccountId,
              categoryId: dto.categoryId,
              subCategoryId: dto.subCategoryId,
              amount: dto.amount,
              expenseDate,
              paymentMethod: dto.paymentMethod,
              paymentAccountId: dto.paymentAccountId,
              vendorId: dto.vendorId,
              description: dto.description,
              reference: dto.reference,
              journalEntryId: journalEntry.id,
              createdBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );
        result = created;
      });

      return result!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * The expenses behind one Expense Sheet PDF, oldest first, plus what its header prints. The filters are the ones the
   * Expenses page applies; a main category also covers expenses recorded before categories existed (they are
   * filed under the category of their account).
   */
  async ledger(tenantId: string, branchId: string | null, query: ExpenseLedgerQueryDto) {
    if (query.from && query.to && query.from > query.to) throw new BadRequestException('"from" must be on or before "to"');
    await this.ensureExpenseNumbers(tenantId);
    const tenantOid = new Types.ObjectId(tenantId);
    const filter: Record<string, unknown> = { tenantId: tenantOid, deletedAt: null };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
    if (query.from || query.to) {
      const range = rangeOf(query.from ?? '1970-01-01', query.to ?? '2999-12-31');
      filter.expenseDate = { $gte: range.from, $lte: range.to };
    }

    let main = query.categoryId ? await this.categoryModel.findOne({ _id: query.categoryId, tenantId: tenantOid, parentId: null }).lean() : null;
    if (query.categoryId && !main) throw new NotFoundException('Expense category not found');
    let sub = query.subCategoryId ? await this.categoryModel.findOne({ _id: query.subCategoryId, tenantId: tenantOid, parentId: { $ne: null } }).lean() : null;
    if (query.subCategoryId && !sub) throw new NotFoundException('Expense sub-category not found');
    if (sub && main && sub.parentId !== String(main._id)) throw new BadRequestException('That sub-category does not belong to the chosen category');
    if (sub && !main) main = await this.categoryModel.findOne({ _id: sub.parentId, tenantId: tenantOid }).lean();
    // A category's entries: those recorded under it, plus older ones recorded against its account alone in its branch.
    if (main) {
      filter.$or = [
        { categoryId: String(main._id) },
        { categoryId: { $exists: false }, expenseAccountId: main.accountId, branchId: main.branchId },
      ];
    }
    // A category belongs to one branch (its account may be shared with same-named ones elsewhere): without a branch
    // chosen, the sheet is that category's branch.
    if (main?.branchId && !branchId) filter.branchId = main.branchId;
    if (sub) filter.subCategoryId = String(sub._id);

    const documents = await this.expenseModel.find(filter).sort({ expenseDate: 1, createdAt: 1 });
    let expenses = await this.toResponses(documents);
    const needle = query.search?.trim().toLowerCase();
    if (needle) {
      expenses = expenses.filter((e) =>
        [e.description, e.reference, e.vendorName, e.categoryName, e.subCategoryName, e.amount].some((v) => String(v ?? '').toLowerCase().includes(needle)),
      );
    }

    const [tenant, branch] = await Promise.all([
      this.tenantModel.findById(tenantId).select('name').lean(),
      branchId ? this.branchModel.findOne({ _id: new Types.ObjectId(branchId), tenantId: tenantOid }).select('name address').lean() : null,
    ]);
    return {
      expenses,
      businessName: tenant?.name ?? 'Medicore',
      branchName: branch?.name ?? 'All branches',
      branchAddress: branch?.address,
      categoryName: main?.name,
      subCategoryName: sub?.name,
      paymentMethod: query.paymentMethod,
      search: needle ? query.search?.trim() : undefined,
      from: query.from,
      to: query.to,
    };
  }

  /** Responses with the account, vendor and category names filled in (looked up once for the whole list). */
  async toResponses(expenses: ExpenseDocument[]): Promise<ExpenseType[]> {
    if (expenses.length === 0) return [];
    const tenantOid = expenses[0].tenantId;
    const ids = (pick: (e: ExpenseDocument) => string | undefined) => [...new Set(expenses.map(pick).filter((v): v is string => !!v))];
    const vendorIds = ids((e) => e.vendorId).filter((v) => Types.ObjectId.isValid(v));
    const [accounts, vendors, categories] = await Promise.all([
      this.accountModel.find({ tenantId: tenantOid, _id: { $in: [...ids((e) => e.expenseAccountId), ...ids((e) => e.paymentAccountId)] } }).select('name').lean(),
      vendorIds.length ? this.vendorModel.find({ tenantId: tenantOid, _id: { $in: vendorIds.map((v) => new Types.ObjectId(v)) } }).select('company').lean() : [],
      this.categoryModel.find({ tenantId: tenantOid }).select('name parentId accountId').lean(),
    ]);
    const accountName = new Map<string, string>(accounts.map((a) => [String(a._id), a.name] as [string, string]));
    const vendorName = new Map<string, string>(vendors.map((v) => [String(v._id), v.company] as [string, string]));
    type Cat = (typeof categories)[number];
    const category = new Map<string, Cat>(categories.map((c) => [String(c._id), c] as [string, Cat]));
    // Expenses from before categories existed are filed under the main category of their account.
    // Keyed by account and branch: same-named categories of different branches share the account.
    const mainByAccount = new Map<string, Cat>(
      categories.filter((c) => !c.parentId && c.accountId).map((c) => [`${c.accountId}:${String(c.branchId)}`, c] as [string, Cat]),
    );

    return expenses.map((e) => {
      const main = e.categoryId ? category.get(e.categoryId) : mainByAccount.get(`${e.expenseAccountId}:${String(e.branchId)}`);
      return this.toExpenseResponse(e, {
        expenseAccountName: accountName.get(e.expenseAccountId),
        paymentAccountName: e.paymentAccountId ? accountName.get(e.paymentAccountId) : undefined,
        vendorName: e.vendorId ? vendorName.get(e.vendorId) : undefined,
        categoryId: main ? String(main._id) : undefined,
        categoryName: main?.name ?? accountName.get(e.expenseAccountId),
        subCategoryName: e.subCategoryId ? category.get(e.subCategoryId)?.name : undefined,
      });
    });
  }

  toExpenseResponse(expense: ExpenseDocument, names: Partial<ExpenseType> = {}): ExpenseType {
    const obj = expense.toObject() as any;
    return {
      ...names,
      id: obj._id.toString(),
      expenseNumber: obj.expenseSeq,
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      expenseAccountId: obj.expenseAccountId,
      subCategoryId: obj.subCategoryId,
      amount: obj.amount,
      expenseDate: obj.expenseDate.toISOString(),
      paymentMethod: obj.paymentMethod,
      paymentAccountId: obj.paymentAccountId,
      source: obj.sourceType === 'CASH_RECEIPT' ? 'CASH_RECEIPT' : undefined,
      invoiceNumber: obj.invoiceNumber,
      invoiceId: obj.invoiceId,
      vendorId: obj.vendorId,
      description: obj.description,
      reference: obj.reference,
      journalEntryId: obj.journalEntryId,
      createdBy: obj.createdBy.toString(),
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
