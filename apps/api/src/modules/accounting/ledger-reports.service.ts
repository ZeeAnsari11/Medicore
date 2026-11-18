import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument } from './schemas/account.schema';
import { JournalEntry, JournalEntryDocument, LEDGER_VISIBLE_STATUSES } from './schemas/journal-entry.schema';
import { round2 } from './accounting-posting.service';
import { AccountType, JournalEntryStatus } from '@medicore/shared-types';
import type {
  TrialBalanceResponse,
  TrialBalanceRow,
  ProfitLossResponse,
  BalanceSheetResponse,
  AccountingOverviewResponse,
} from '@medicore/shared-types';

@Injectable()
export class LedgerReportsService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name) private readonly journalEntryModel: Model<JournalEntryDocument>,
  ) {}

  async getTrialBalance(
    tenantId: string,
    branchId: string | null,
    asOfDate?: string,
  ): Promise<TrialBalanceResponse> {
    const match: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      status: { $in: LEDGER_VISIBLE_STATUSES },
      deletedAt: null,
    };
    if (branchId) match.branchId = new Types.ObjectId(branchId);
    if (asOfDate) match.entryDate = { $lte: new Date(asOfDate) };

    const totals = await this.journalEntryModel.aggregate<{
      _id: string;
      debit: number;
      credit: number;
    }>([
      { $match: match },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.accountId',
          debit: { $sum: '$lines.debit' },
          credit: { $sum: '$lines.credit' },
        },
      },
    ]);

    const accounts = await this.accountModel.find({ tenantId: new Types.ObjectId(tenantId) });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const rows: TrialBalanceRow[] = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (const t of totals) {
      const account = accountById.get(t._id);
      if (!account) continue;
      const net = round2(t.debit - t.credit);
      const debit = net >= 0 ? net : 0;
      const credit = net < 0 ? -net : 0;
      if (debit === 0 && credit === 0) continue;
      rows.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        type: account.type,
        debit,
        credit,
      });
      totalDebit += debit;
      totalCredit += credit;
    }
    rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    return { rows, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit) };
  }

  async getProfitLoss(
    tenantId: string,
    branchId: string | null,
    startDate?: string,
    endDate?: string,
  ): Promise<ProfitLossResponse> {
    const match: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      status: { $in: LEDGER_VISIBLE_STATUSES },
      deletedAt: null,
    };
    if (branchId) match.branchId = new Types.ObjectId(branchId);
    if (startDate || endDate) {
      const entryDate: Record<string, Date> = {};
      if (startDate) entryDate.$gte = new Date(startDate);
      if (endDate) entryDate.$lte = new Date(endDate);
      match.entryDate = entryDate;
    }

    const totals = await this.journalEntryModel.aggregate<{
      _id: string;
      debit: number;
      credit: number;
    }>([
      { $match: match },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.accountId',
          debit: { $sum: '$lines.debit' },
          credit: { $sum: '$lines.credit' },
        },
      },
    ]);

    const accounts = await this.accountModel.find({ tenantId: new Types.ObjectId(tenantId) });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const revenue: ProfitLossResponse['revenue'] = [];
    const expenses: ProfitLossResponse['expenses'] = [];
    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const t of totals) {
      const account = accountById.get(t._id);
      if (!account) continue;
      if (account.type === AccountType.REVENUE) {
        const amount = round2(t.credit - t.debit);
        if (amount === 0) continue;
        revenue.push({ accountId: account.id, accountName: account.name, amount });
        totalRevenue += amount;
      } else if (account.type === AccountType.EXPENSE) {
        const amount = round2(t.debit - t.credit);
        if (amount === 0) continue;
        expenses.push({ accountId: account.id, accountName: account.name, amount });
        totalExpenses += amount;
      }
    }

    return {
      revenue,
      totalRevenue: round2(totalRevenue),
      expenses,
      totalExpenses: round2(totalExpenses),
      netIncome: round2(totalRevenue - totalExpenses),
    };
  }

  async getBalanceSheet(
    tenantId: string,
    branchId: string | null,
    asOfDate?: string,
  ): Promise<BalanceSheetResponse> {
    const match: Record<string, unknown> = {
      tenantId: new Types.ObjectId(tenantId),
      status: { $in: LEDGER_VISIBLE_STATUSES },
      deletedAt: null,
    };
    if (branchId) match.branchId = new Types.ObjectId(branchId);
    if (asOfDate) match.entryDate = { $lte: new Date(asOfDate) };

    const totals = await this.journalEntryModel.aggregate<{
      _id: string;
      debit: number;
      credit: number;
    }>([
      { $match: match },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.accountId',
          debit: { $sum: '$lines.debit' },
          credit: { $sum: '$lines.credit' },
        },
      },
    ]);

    const accounts = await this.accountModel.find({ tenantId: new Types.ObjectId(tenantId) });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const assets: BalanceSheetResponse['assets'] = [];
    const liabilities: BalanceSheetResponse['liabilities'] = [];
    const equity: BalanceSheetResponse['equity'] = [];
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let netIncome = 0;

    for (const t of totals) {
      const account = accountById.get(t._id);
      if (!account) continue;
      if (account.type === AccountType.ASSET) {
        const amount = round2(t.debit - t.credit);
        if (amount === 0) continue;
        assets.push({ accountId: account.id, accountName: account.name, amount });
        totalAssets += amount;
      } else if (account.type === AccountType.LIABILITY) {
        const amount = round2(t.credit - t.debit);
        if (amount === 0) continue;
        liabilities.push({ accountId: account.id, accountName: account.name, amount });
        totalLiabilities += amount;
      } else if (account.type === AccountType.EQUITY) {
        const amount = round2(t.credit - t.debit);
        if (amount === 0) continue;
        equity.push({ accountId: account.id, accountName: account.name, amount });
        totalEquity += amount;
      } else if (account.type === AccountType.REVENUE) {
        netIncome += t.credit - t.debit;
      } else if (account.type === AccountType.EXPENSE) {
        netIncome -= t.debit - t.credit;
      }
    }
    netIncome = round2(netIncome);

    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 0.01;

    return {
      assets,
      totalAssets: round2(totalAssets),
      liabilities,
      totalLiabilities: round2(totalLiabilities),
      equity,
      totalEquity: round2(totalEquity),
      netIncome,
      isBalanced,
    };
  }

  async getOverview(
    tenantId: string,
    branchId: string | null,
  ): Promise<AccountingOverviewResponse> {
    const accounts = await this.accountModel.find({
      tenantId: new Types.ObjectId(tenantId),
      systemKey: { $in: ['ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'CASH', 'BANK'] },
    });
    const byKey = new Map(accounts.map((a) => [a.systemKey, a]));

    const balanceFor = async (
      accountId: string | undefined,
      direction: 'debitCredit' | 'creditDebit',
    ) => {
      if (!accountId) return 0;
      const match: Record<string, unknown> = {
        tenantId: new Types.ObjectId(tenantId),
        status: { $in: LEDGER_VISIBLE_STATUSES },
        deletedAt: null,
      };
      if (branchId) match.branchId = new Types.ObjectId(branchId);
      const [result] = await this.journalEntryModel.aggregate<{ debit: number; credit: number }>([
        { $match: match },
        { $unwind: '$lines' },
        { $match: { 'lines.accountId': accountId } },
        {
          $group: { _id: null, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } },
        },
      ]);
      if (!result) return 0;
      return direction === 'debitCredit'
        ? round2(result.debit - result.credit)
        : round2(result.credit - result.debit);
    };

    const [totalReceivable, totalPayable, cashBalance, bankBalance] = await Promise.all([
      balanceFor(byKey.get('ACCOUNTS_RECEIVABLE')?.id, 'debitCredit'),
      balanceFor(byKey.get('ACCOUNTS_PAYABLE')?.id, 'creditDebit'),
      balanceFor(byKey.get('CASH')?.id, 'debitCredit'),
      balanceFor(byKey.get('BANK')?.id, 'debitCredit'),
    ]);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const pl = await this.getProfitLoss(
      tenantId,
      branchId,
      startOfMonth.toISOString(),
      new Date().toISOString(),
    );

    return {
      totalReceivable,
      totalPayable,
      cashAndBankBalance: round2(cashBalance + bankBalance),
      netIncomeThisMonth: pl.netIncome,
    };
  }
}
