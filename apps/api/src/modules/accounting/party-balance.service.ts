import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument } from './schemas/account.schema';
import { JournalEntry, JournalEntryDocument, LEDGER_VISIBLE_STATUSES } from './schemas/journal-entry.schema';
import { JournalEntryStatus } from '@medicore/shared-types';
import { round2 } from './accounting-posting.service';

/**
 * Small, focused ledger-balance lookup, exported separately from the
 * heavier LedgerReportsService so modules like Customers can depend on
 * just this without pulling in the whole Accounting controller surface.
 * This is the ONLY place a customer/vendor "outstanding balance" should be
 * computed from — never `Customer.totalDue` (deprecated, unused here).
 */
@Injectable()
export class PartyBalanceService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name) private readonly journalEntryModel: Model<JournalEntryDocument>,
  ) {}

  /** Positive = customer owes us (AR is asset/debit-normal: debit − credit). */
  async getCustomerBalance(tenantId: string, customerId: string): Promise<number> {
    return this.getPartyAccountBalance(
      tenantId,
      'ACCOUNTS_RECEIVABLE',
      customerId,
      'debitMinusCredit',
    );
  }

  /** Positive = customer has unapplied credit/advance available. */
  async getCustomerAdvanceBalance(tenantId: string, customerId: string): Promise<number> {
    return this.getPartyAccountBalance(
      tenantId,
      'CUSTOMER_ADVANCES',
      customerId,
      'creditMinusDebit',
    );
  }

  /** Positive = we owe the vendor (AP is liability/credit-normal: credit − debit). */
  async getVendorBalance(tenantId: string, vendorId: string): Promise<number> {
    return this.getPartyAccountBalance(tenantId, 'ACCOUNTS_PAYABLE', vendorId, 'creditMinusDebit');
  }

  /** Positive = we have an unapplied prepayment sitting with this vendor. */
  async getVendorAdvanceBalance(tenantId: string, vendorId: string): Promise<number> {
    return this.getPartyAccountBalance(tenantId, 'VENDOR_ADVANCES', vendorId, 'debitMinusCredit');
  }

  /**
   * One-query balance lookup for every customer at once (keyed by customerId),
   * for list views where a per-row ledger aggregation would be N+1.
   */
  async getAllCustomerBalances(tenantId: string): Promise<Record<string, number>> {
    return this.getAllPartyAccountBalances(tenantId, 'ACCOUNTS_RECEIVABLE', 'debitMinusCredit');
  }

  /** Same as {@link getAllCustomerBalances}, for vendors against Accounts Payable. */
  async getAllVendorBalances(tenantId: string): Promise<Record<string, number>> {
    return this.getAllPartyAccountBalances(tenantId, 'ACCOUNTS_PAYABLE', 'creditMinusDebit');
  }

  private async getAllPartyAccountBalances(
    tenantId: string,
    systemKey: string,
    direction: 'debitMinusCredit' | 'creditMinusDebit',
  ): Promise<Record<string, number>> {
    const account = await this.accountModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      systemKey,
    });
    if (!account) return {};

    const results = await this.journalEntryModel.aggregate<{
      _id: string;
      debit: number;
      credit: number;
    }>([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          status: { $in: LEDGER_VISIBLE_STATUSES },
          deletedAt: null,
        },
      },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': account.id, 'lines.partyId': { $ne: null } } },
      {
        $group: {
          _id: '$lines.partyId',
          debit: { $sum: '$lines.debit' },
          credit: { $sum: '$lines.credit' },
        },
      },
    ]);

    const balances: Record<string, number> = {};
    for (const r of results) {
      balances[r._id] =
        direction === 'debitMinusCredit' ? round2(r.debit - r.credit) : round2(r.credit - r.debit);
    }
    return balances;
  }

  private async getPartyAccountBalance(
    tenantId: string,
    systemKey: string,
    partyId: string,
    direction: 'debitMinusCredit' | 'creditMinusDebit',
  ): Promise<number> {
    const account = await this.accountModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      systemKey,
    });
    if (!account) return 0;

    const [result] = await this.journalEntryModel.aggregate<{ debit: number; credit: number }>([
      {
        $match: {
          tenantId: new Types.ObjectId(tenantId),
          status: { $in: LEDGER_VISIBLE_STATUSES },
          deletedAt: null,
        },
      },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': account.id, 'lines.partyId': partyId } },
      { $group: { _id: null, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
    ]);

    if (!result) return 0;
    return direction === 'debitMinusCredit'
      ? round2(result.debit - result.credit)
      : round2(result.credit - result.debit);
  }
}
