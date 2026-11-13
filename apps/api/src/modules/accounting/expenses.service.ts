import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Expense, ExpenseDocument } from './schemas/expense.schema';
import { Account, AccountDocument } from './schemas/account.schema';
import { AccountingPostingService, type PostLineInput } from './accounting-posting.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { JournalEntrySourceType } from '@medicore/shared-types';
import type { Expense as ExpenseType } from '@medicore/shared-types';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name) private readonly expenseModel: Model<ExpenseDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly postingService: AccountingPostingService,
  ) {}

  async listForTenant(tenantId: string, branchId: string | null) {
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
    const [expenseAccount, paymentAccount] = await Promise.all([
      this.accountModel.findOne({
        _id: dto.expenseAccountId,
        tenantId: new Types.ObjectId(tenantId),
      }),
      this.accountModel.findOne({
        _id: dto.paymentAccountId,
        tenantId: new Types.ObjectId(tenantId),
      }),
    ]);
    if (!expenseAccount) throw new NotFoundException('Expense account not found');
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
              expenseAccountId: dto.expenseAccountId,
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

  toExpenseResponse(expense: ExpenseDocument): ExpenseType {
    const obj = expense.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId.toString(),
      expenseAccountId: obj.expenseAccountId,
      amount: obj.amount,
      expenseDate: obj.expenseDate.toISOString(),
      paymentMethod: obj.paymentMethod,
      paymentAccountId: obj.paymentAccountId,
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
