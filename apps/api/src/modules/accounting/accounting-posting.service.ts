import { DIFFERENCE_LINE_DESCRIPTION } from './difference';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Account, AccountDocument } from './schemas/account.schema';
import { JournalEntry, JournalEntryDocument } from './schemas/journal-entry.schema';
import { Batch, BatchDocument } from '../inventory/schemas/batch.schema';
import { SequenceService } from '../../common/sequence/sequence.service';
import { splitPurchaseSettlement } from './purchase-settlement';
import {
  AccountType,
  JournalEntrySourceType,
  JournalEntryStatus,
  NormalBalance,
  PartyType,
  PaymentMethod,
} from '@medicore/shared-types';

export type SystemAccountKey =
  | 'CASH'
  | 'BANK'
  | 'ACCOUNTS_RECEIVABLE'
  | 'INVENTORY'
  | 'VENDOR_ADVANCES'
  | 'ACCOUNTS_PAYABLE'
  | 'CUSTOMER_ADVANCES'
  | 'TAX_PAYABLE'
  | 'OWNER_CAPITAL'
  | 'OPENING_BALANCE_EQUITY'
  | 'SALES_REVENUE'
  | 'COGS'
  | 'OPERATING_EXPENSES'
  | 'BANK_CHARGES'
  | 'OTHER_EXPENSES'
  | 'PURCHASE_DISCOUNT'
  | 'LOANS_PAYABLE'
  | 'INTEREST_EXPENSE'
  | 'FIXED_ASSETS'
  | 'DISPOSAL_GAIN_LOSS'
  | 'OTHER_INCOME';

interface DefaultAccountSpec {
  systemKey: SystemAccountKey;
  code: string;
  name: string;
  type: AccountType;
  /** Only when it differs from the type's usual side (a contra account). */
  normalBalance?: NormalBalance;
}

/**
 * Default Chart of Accounts for a medicine-distribution business. Seeded
 * lazily, idempotently, per tenant — see ensureDefaultAccounts. Tax is
 * intentionally split out (TAX_PAYABLE) since Sale/Purchase taxTotal is a
 * real, honestly-computed figure, not folded into Sales Revenue.
 */
const DEFAULT_ACCOUNTS: DefaultAccountSpec[] = [
  { systemKey: 'CASH', code: '1000', name: 'Cash', type: AccountType.ASSET },
  { systemKey: 'BANK', code: '1010', name: 'Bank', type: AccountType.ASSET },
  {
    systemKey: 'ACCOUNTS_RECEIVABLE',
    code: '1100',
    name: 'Accounts Receivable',
    type: AccountType.ASSET,
  },
  { systemKey: 'INVENTORY', code: '1200', name: 'Inventory', type: AccountType.ASSET },
  { systemKey: 'VENDOR_ADVANCES', code: '1300', name: 'Vendor Advances', type: AccountType.ASSET },
  {
    systemKey: 'ACCOUNTS_PAYABLE',
    code: '2000',
    name: 'Accounts Payable',
    type: AccountType.LIABILITY,
  },
  {
    systemKey: 'CUSTOMER_ADVANCES',
    code: '2100',
    name: 'Customer Advances',
    type: AccountType.LIABILITY,
  },
  { systemKey: 'TAX_PAYABLE', code: '2200', name: 'Tax Payable', type: AccountType.LIABILITY },
  { systemKey: 'OWNER_CAPITAL', code: '3000', name: 'Owner Capital', type: AccountType.EQUITY },
  {
    systemKey: 'OPENING_BALANCE_EQUITY',
    code: '3100',
    name: 'Opening Balance Equity',
    type: AccountType.EQUITY,
  },
  { systemKey: 'SALES_REVENUE', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE },
  // What a vendor lets the business off at a cash payment (the Difference on a bulk purchase receipt).
  {
    systemKey: 'PURCHASE_DISCOUNT',
    code: '4900',
    name: 'Purchase Discount / Difference',
    type: AccountType.REVENUE,
  },
  { systemKey: 'COGS', code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE },
  {
    systemKey: 'OPERATING_EXPENSES',
    code: '5100',
    name: 'Operating Expenses',
    type: AccountType.EXPENSE,
  },
  { systemKey: 'BANK_CHARGES', code: '5200', name: 'Bank Charges', type: AccountType.EXPENSE },
  { systemKey: 'OTHER_EXPENSES', code: '5900', name: 'Other Expenses', type: AccountType.EXPENSE },
  // Loans and fixed assets. Expense codes stay above 5900: 5300-5890 belong to the Expenses page's categories.
  { systemKey: 'FIXED_ASSETS', code: '1500', name: 'Fixed Assets', type: AccountType.ASSET },
  { systemKey: 'LOANS_PAYABLE', code: '2300', name: 'Loans Payable', type: AccountType.LIABILITY },
  { systemKey: 'INTEREST_EXPENSE', code: '5910', name: 'Interest Expense', type: AccountType.EXPENSE },
  { systemKey: 'OTHER_INCOME', code: '4800', name: 'Other Income', type: AccountType.REVENUE },
  { systemKey: 'DISPOSAL_GAIN_LOSS', code: '5930', name: 'Loss / (Gain) on Asset Disposal', type: AccountType.EXPENSE },
];

function normalBalanceFor(type: AccountType): NormalBalance {
  return type === AccountType.ASSET || type === AccountType.EXPENSE
    ? NormalBalance.DEBIT
    : NormalBalance.CREDIT;
}

export interface PostLineInput {
  accountId: string;
  debit: number;
  credit: number;
  partyType?: PartyType;
  partyId?: string;
  description?: string;
}

export interface PostJournalEntryParams {
  tenantId: string;
  branchId: string | null;
  entryDate: Date;
  sourceType: JournalEntrySourceType;
  sourceId?: string;
  description: string;
  lines: PostLineInput[];
  createdBy: string;
  session: ClientSession;
}

interface SaleAllocationInput {
  batchId: string;
  quantity: number;
}

interface SaleItemInput {
  productId: string;
  batchAllocations: SaleAllocationInput[];
}

export interface PostSaleEntryParams {
  tenantId: string;
  branchId: string;
  saleId: string;
  saleDate: Date;
  customerId?: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  /** Part of `amountPaid` settled from the customer's advance (Dr Customer Advances instead of Dr Cash). */
  advanceApplied?: number;
  items: SaleItemInput[];
  createdBy: string;
  session: ClientSession;
}

interface PurchaseItemInput {
  quantity: number;
  purchasePrice: number;
}

export interface PostPurchaseEntryParams {
  tenantId: string;
  branchId: string;
  purchaseId: string;
  purchaseDate: Date;
  vendorId: string;
  grandTotal: number;
  amountPaid: number;
  /** Part of `amountPaid` settled from the vendor's advance (Cr Vendor Advances instead of Cr Cash). */
  advanceApplied?: number;
  createdBy: string;
  session: ClientSession;
}

const BALANCE_EPSILON = 0.01;

@Injectable()
export class AccountingPostingService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(JournalEntry.name) private readonly journalEntryModel: Model<JournalEntryDocument>,
    @InjectModel(Batch.name) private readonly batchModel: Model<BatchDocument>,
    private readonly sequenceService: SequenceService,
  ) {}

  /**
   * Idempotent: creates any DEFAULT_ACCOUNTS not yet present for this
   * tenant, resolved by systemKey (never by display name). Called at the
   * top of every posting method so Sales/Purchases never fail because
   * accounting hasn't been manually configured yet.
   */
  async ensureDefaultAccounts(
    tenantId: string,
    session: ClientSession,
  ): Promise<Map<SystemAccountKey, AccountDocument>> {
    const existing = await this.accountModel
      .find({ tenantId: new Types.ObjectId(tenantId), systemKey: { $ne: null } })
      .session(session);
    const byKey = new Map<SystemAccountKey, AccountDocument>(
      existing.map((a) => [a.systemKey as SystemAccountKey, a]),
    );

    const missing = DEFAULT_ACCOUNTS.filter((spec) => !byKey.has(spec.systemKey));
    if (missing.length > 0) {
      const created = await this.accountModel.create(
        missing.map((spec) => ({
          tenantId: new Types.ObjectId(tenantId),
          code: spec.code,
          name: spec.name,
          type: spec.type,
          normalBalance: spec.normalBalance ?? normalBalanceFor(spec.type),
          systemKey: spec.systemKey,
          isSystemAccount: true,
          isActive: true,
        })),
        { session, ordered: true },
      );
      for (const doc of created) byKey.set(doc.systemKey as SystemAccountKey, doc);
    }

    return byKey;
  }

  /**
   * Several system accounts in one go. Resolve them together like this, never with Promise.all over
   * resolveSystemAccount on one session: each call seeds the missing defaults, and concurrent calls race
   * to create the same accounts (duplicate code).
   */
  async resolveSystemAccounts<K extends SystemAccountKey>(
    tenantId: string,
    keys: readonly K[],
    session: ClientSession,
  ): Promise<Record<K, AccountDocument>> {
    const accounts = await this.ensureDefaultAccounts(tenantId, session);
    const out = {} as Record<K, AccountDocument>;
    for (const key of keys) {
      const account = accounts.get(key);
      if (!account) throw new BadRequestException(`System account ${key} could not be resolved`);
      out[key] = account;
    }
    return out;
  }

  async resolveSystemAccount(
    tenantId: string,
    systemKey: SystemAccountKey,
    session: ClientSession,
  ): Promise<AccountDocument> {
    const accounts = await this.ensureDefaultAccounts(tenantId, session);
    const account = accounts.get(systemKey);
    if (!account)
      throw new BadRequestException(`System account ${systemKey} could not be resolved`);
    return account;
  }

  /** Low-level primitive — every other post* method builds `lines` and calls this. */
  async postJournalEntry(params: PostJournalEntryParams): Promise<JournalEntryDocument> {
    const totalDebit = round2(params.lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = round2(params.lines.reduce((sum, l) => sum + l.credit, 0));

    if (Math.abs(totalDebit - totalCredit) > BALANCE_EPSILON) {
      throw new BadRequestException(
        `Journal entry is not balanced: total debit ${totalDebit} does not equal total credit ${totalCredit}`,
      );
    }

    // Every entry belongs to a branch (taken from the document being posted; the top-bar branch is never
    // used) but is numbered 1, 2, 3, ... across the whole business.
    const branchId = params.branchId;
    if (!branchId) throw new BadRequestException({ statusCode: 400, message: ['branchId should not be empty'], error: 'Bad Request' });
    const branch = await this.journalEntryModel.db
      .model('Branch')
      .exists({ _id: branchId, tenantId: new Types.ObjectId(params.tenantId) })
      .session(params.session ?? null)
      .exec();
    if (!branch) throw new NotFoundException('Branch not found');
    const seq = await this.sequenceService.next(params.tenantId, null, 'journal', params.session);
    const entryNumber = String(seq);

    const [created] = await this.journalEntryModel.create(
      [
        {
          tenantId: new Types.ObjectId(params.tenantId),
          branchId: new Types.ObjectId(branchId),
          entryNumber,
          entryDate: params.entryDate,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          description: params.description,
          lines: params.lines,
          totalDebit,
          totalCredit,
          status: JournalEntryStatus.POSTED,
          createdBy: new Types.ObjectId(params.createdBy),
        },
      ],
      { session: params.session },
    );

    return created;
  }

  /**
   * Dr AR(arPortion)/Cash(cashPortion) + Cr Sales Revenue + Cr Tax Payable,
   * Dr COGS + Cr Inventory. Cost basis is read from Batch.purchasePrice at
   * posting time and baked into the immutable line — never re-derived later.
   */
  async postSaleEntry(params: PostSaleEntryParams): Promise<JournalEntryDocument> {
    const lines = await this.buildSaleLines(params);
    return this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryDate: params.saleDate,
      sourceType: JournalEntrySourceType.SALE,
      sourceId: params.saleId,
      description: `Sale ${params.saleId}`,
      lines,
      createdBy: params.createdBy,
      session: params.session,
    });
  }

  /**
   * An invoice edit: the sale's own live entry is rewritten in place (same entry, same number, new lines and
   * totals) so the ledger shows one row per invoice instead of a reversal plus a re-post. Falls back to a fresh
   * posting when the sale has no live entry (e.g. it was never posted).
   */
  async editSaleEntryInPlace(params: PostSaleEntryParams): Promise<JournalEntryDocument> {
    const entry = await this.journalEntryModel
      .findOne({
        tenantId: new Types.ObjectId(params.tenantId),
        sourceType: JournalEntrySourceType.SALE,
        sourceId: params.saleId,
        status: JournalEntryStatus.POSTED,
        deletedAt: null,
      })
      .session(params.session);
    if (!entry) return this.postSaleEntry(params);

    const lines = await this.buildSaleLines(params);
    const totalDebit = round2(lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = round2(lines.reduce((sum, l) => sum + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > BALANCE_EPSILON) {
      throw new BadRequestException(
        `Journal entry is not balanced: total debit ${totalDebit} does not equal total credit ${totalCredit}`,
      );
    }
    entry.set('lines', lines);
    entry.totalDebit = totalDebit;
    entry.totalCredit = totalCredit;
    entry.entryDate = params.saleDate;
    entry.markModified('lines');
    return entry.save({ session: params.session });
  }

  private async buildSaleLines(params: PostSaleEntryParams): Promise<PostLineInput[]> {
    const accounts = await this.ensureDefaultAccounts(params.tenantId, params.session);
    const arPortion = round2(Math.max(params.grandTotal - params.amountPaid, 0));
    const paidPortion = round2(Math.min(params.amountPaid, params.grandTotal));
    const advancePortion = params.customerId ? round2(Math.min(params.advanceApplied ?? 0, paidPortion)) : 0;
    const cashPortion = round2(paidPortion - advancePortion);
    const revenue = round2(params.subtotal - params.discountTotal);

    const lines: PostLineInput[] = [];
    if (advancePortion > 0) {
      lines.push({
        accountId: accounts.get('CUSTOMER_ADVANCES')!.id,
        debit: advancePortion,
        credit: 0,
        partyType: PartyType.CUSTOMER,
        partyId: params.customerId,
        description: 'Advance applied to invoice',
      });
    }
    if (arPortion > 0) {
      lines.push({
        accountId: accounts.get('ACCOUNTS_RECEIVABLE')!.id,
        debit: arPortion,
        credit: 0,
        partyType: params.customerId ? PartyType.CUSTOMER : undefined,
        partyId: params.customerId,
        description: 'Sale on account',
      });
    }
    if (cashPortion > 0) {
      lines.push({
        accountId: accounts.get('CASH')!.id,
        debit: cashPortion,
        credit: 0,
        description: 'Sale paid at POS',
      });
    }
    lines.push({
      accountId: accounts.get('SALES_REVENUE')!.id,
      debit: 0,
      credit: revenue,
      description: 'Sales revenue',
    });
    if (params.taxTotal > 0) {
      lines.push({
        accountId: accounts.get('TAX_PAYABLE')!.id,
        debit: 0,
        credit: round2(params.taxTotal),
        description: 'Tax collected',
      });
    }

    const cost = await this.computeSaleCost(params.items, params.session);
    if (cost > 0) {
      lines.push({
        accountId: accounts.get('COGS')!.id,
        debit: cost,
        credit: 0,
        description: 'Cost of goods sold',
      });
      lines.push({
        accountId: accounts.get('INVENTORY')!.id,
        debit: 0,
        credit: cost,
        description: 'Inventory reduction',
      });
    }

    return lines;
  }

  /** Exact equal-and-opposite reversal of the sale's own entry lines. */
  async postSaleCancellationEntry(
    tenantId: string,
    branchId: string,
    saleId: string,
    createdBy: string,
    session: ClientSession,
  ): Promise<JournalEntryDocument | null> {
    return this.reverseEntry(
      tenantId,
      branchId,
      JournalEntrySourceType.SALE,
      saleId,
      JournalEntrySourceType.SALE_CANCELLATION,
      `Cancellation of sale ${saleId}`,
      createdBy,
      session,
    );
  }

  /** Reverses the sale's entry for an edit; the caller then posts a fresh sale entry. */
  async postSaleEditReversal(
    tenantId: string,
    branchId: string,
    saleId: string,
    createdBy: string,
    session: ClientSession,
  ): Promise<JournalEntryDocument | null> {
    return this.reverseEntry(
      tenantId,
      branchId,
      JournalEntrySourceType.SALE,
      saleId,
      JournalEntrySourceType.SALE_EDIT,
      `Edit of sale ${saleId}`,
      createdBy,
      session,
    );
  }

  /** Reverses the purchase's entry for an edit; the caller then posts a fresh purchase entry. */
  async postPurchaseEditReversal(
    tenantId: string,
    branchId: string,
    purchaseId: string,
    createdBy: string,
    session: ClientSession,
  ): Promise<JournalEntryDocument | null> {
    return this.reverseEntry(
      tenantId,
      branchId,
      JournalEntrySourceType.PURCHASE,
      purchaseId,
      JournalEntrySourceType.PURCHASE_EDIT,
      `Edit of purchase ${purchaseId}`,
      createdBy,
      session,
    );
  }

  /**
   * Reverses every POSTED entry of a payment (its own entry plus any later advance-allocation entries,
   * which share its sourceId). Used when a payment is voided.
   */
  async postPaymentVoidEntries(
    tenantId: string,
    branchId: string | null,
    paymentId: string,
    sourceType: JournalEntrySourceType,
    createdBy: string,
    session: ClientSession,
  ): Promise<number> {
    let count = 0;
    // reverseEntry handles one POSTED entry per call; loop until none are left.
    while (
      await this.reverseEntry(
        tenantId,
        branchId,
        sourceType,
        paymentId,
        JournalEntrySourceType.PAYMENT_VOID,
        `Void of payment ${paymentId}`,
        createdBy,
        session,
      )
    ) {
      count += 1;
    }
    return count;
  }

  /** Dr Inventory(grandTotal, tax folded in) / Cr AP(apPortion) + Cr Cash(cashPortion). */
  async postPurchaseEntry(params: PostPurchaseEntryParams): Promise<JournalEntryDocument> {
    const lines = await this.buildPurchaseLines(params);
    return this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryDate: params.purchaseDate,
      sourceType: JournalEntrySourceType.PURCHASE,
      sourceId: params.purchaseId,
      description: `Purchase ${params.purchaseId}`,
      lines,
      createdBy: params.createdBy,
      session: params.session,
    });
  }

  /**
   * A purchase edit: the purchase's own live entry is rewritten in place (same entry, same number) so the vendor
   * ledger shows one row per invoice instead of a reversal plus a re-post. Posts a fresh entry if none is live.
   */
  async editPurchaseEntryInPlace(params: PostPurchaseEntryParams): Promise<JournalEntryDocument> {
    const entry = await this.journalEntryModel
      .findOne({
        tenantId: new Types.ObjectId(params.tenantId),
        sourceType: JournalEntrySourceType.PURCHASE,
        sourceId: params.purchaseId,
        status: JournalEntryStatus.POSTED,
        deletedAt: null,
      })
      .session(params.session);
    if (!entry) return this.postPurchaseEntry(params);

    const lines = await this.buildPurchaseLines(params);
    const total = round2(lines.reduce((sum, l) => sum + l.debit, 0));
    entry.set('lines', lines);
    entry.totalDebit = total;
    entry.totalCredit = total;
    entry.entryDate = params.purchaseDate;
    entry.markModified('lines');
    return entry.save({ session: params.session });
  }

  private async buildPurchaseLines(params: PostPurchaseEntryParams): Promise<PostLineInput[]> {
    const accounts = await this.ensureDefaultAccounts(params.tenantId, params.session);
    const { apPortion, advancePortion, cashPortion } = splitPurchaseSettlement(
      params.grandTotal,
      params.amountPaid,
      params.advanceApplied,
    );

    const lines: PostLineInput[] = [
      {
        accountId: accounts.get('INVENTORY')!.id,
        debit: round2(params.grandTotal),
        credit: 0,
        description: 'Stock received',
      },
    ];
    if (advancePortion > 0) {
      lines.push({
        accountId: accounts.get('VENDOR_ADVANCES')!.id,
        debit: 0,
        credit: advancePortion,
        partyType: PartyType.VENDOR,
        partyId: params.vendorId,
        description: 'Advance applied to purchase',
      });
    }
    if (apPortion > 0) {
      lines.push({
        accountId: accounts.get('ACCOUNTS_PAYABLE')!.id,
        debit: 0,
        credit: apPortion,
        partyType: PartyType.VENDOR,
        partyId: params.vendorId,
        description: 'Purchase on account',
      });
    }
    if (cashPortion > 0) {
      lines.push({
        accountId: accounts.get('CASH')!.id,
        debit: 0,
        credit: cashPortion,
        description: 'Purchase paid immediately',
      });
    }

    return lines;
  }

  async postPurchaseCancellationEntry(
    tenantId: string,
    branchId: string,
    purchaseId: string,
    createdBy: string,
    session: ClientSession,
  ): Promise<JournalEntryDocument | null> {
    return this.reverseEntry(
      tenantId,
      branchId,
      JournalEntrySourceType.PURCHASE,
      purchaseId,
      JournalEntrySourceType.PURCHASE_CANCELLATION,
      `Cancellation of purchase ${purchaseId}`,
      createdBy,
      session,
    );
  }

  /** Reads Batch.purchasePrice fresh, at posting time, for each allocation. */
  private async computeSaleCost(items: SaleItemInput[], session?: ClientSession): Promise<number> {
    const batchIds = Array.from(
      new Set(items.flatMap((i) => i.batchAllocations.map((a) => a.batchId))),
    );
    if (batchIds.length === 0) return 0;
    const batches = await this.batchModel.find({ _id: { $in: batchIds } }).session(session ?? null);
    const priceByBatch = new Map(batches.map((b) => [b._id, b.purchasePrice]));
    let cost = 0;
    for (const item of items) {
      for (const allocation of item.batchAllocations) {
        cost += (priceByBatch.get(allocation.batchId) ?? 0) * allocation.quantity;
      }
    }
    return round2(cost);
  }

  /**
   * Finds the original POSTED entry for (sourceType, sourceId), builds an
   * entry with every line's debit/credit swapped, posts it as
   * `reversalSourceType`, and marks the original REVERSED. The original's
   * own lines are never touched. Returns null if no original entry exists
   * (e.g. cancelling a sale that predates this system) — callers should
   * treat that as "nothing to reverse," not an error.
   */
  /**
   * Sale return (or the remainder reversed by Void invoice after earlier returns).
   * Dr Sales Revenue + Tax Payable; the credit side is settled against the invoice's
   * outstanding balance (AR), then paid out (Cash/Bank) or kept as Customer Advances.
   * Goods back in sellable stock: Dr Inventory; damaged/expired goods: Dr Other Expenses
   * (a write-off). COGS is credited for the full cost either way.
   */
  async postSaleReturnEntry(params: {
    tenantId: string;
    branchId: string;
    saleId: string;
    customerId?: string;
    entryDate: Date;
    description: string;
    isCancellation: boolean;
    revenue: number;
    tax: number;
    restockCost: number;
    writeOffCost: number;
    applied: number;
    refund: number;
    refundMethod?: PaymentMethod;
    credit: number;
    createdBy: string;
    session: ClientSession;
  }): Promise<JournalEntryDocument> {
    const accounts = await this.ensureDefaultAccounts(params.tenantId, params.session);
    const party = params.customerId
      ? { partyType: PartyType.CUSTOMER, partyId: params.customerId }
      : {};
    const lines: PostLineInput[] = [];
    if (params.revenue > 0)
      lines.push({ accountId: accounts.get('SALES_REVENUE')!.id, debit: params.revenue, credit: 0, description: 'Sale return' });
    if (params.tax > 0)
      lines.push({ accountId: accounts.get('TAX_PAYABLE')!.id, debit: params.tax, credit: 0, description: 'Tax reversed on return' });
    if (params.applied > 0)
      lines.push({ accountId: accounts.get('ACCOUNTS_RECEIVABLE')!.id, debit: 0, credit: params.applied, ...party, description: 'Credit for returned goods' });
    if (params.refund > 0)
      lines.push({
        accountId: accounts.get(params.refundMethod && params.refundMethod !== PaymentMethod.CASH ? 'BANK' : 'CASH')!.id,
        debit: 0,
        credit: params.refund,
        description: 'Refund paid for returned goods',
      });
    if (params.credit > 0)
      lines.push({ accountId: accounts.get('CUSTOMER_ADVANCES')!.id, debit: 0, credit: params.credit, ...party, description: 'Credit kept for returned goods' });
    if (params.restockCost > 0)
      lines.push({ accountId: accounts.get('INVENTORY')!.id, debit: params.restockCost, credit: 0, description: 'Inventory restored' });
    if (params.writeOffCost > 0)
      lines.push({ accountId: accounts.get('OTHER_EXPENSES')!.id, debit: params.writeOffCost, credit: 0, description: 'Returned goods written off' });
    const cost = round2(params.restockCost + params.writeOffCost);
    if (cost > 0)
      lines.push({ accountId: accounts.get('COGS')!.id, debit: 0, credit: cost, description: 'COGS reversed on return' });

    return this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryDate: params.entryDate,
      sourceType: params.isCancellation
        ? JournalEntrySourceType.SALE_CANCELLATION
        : JournalEntrySourceType.SALE_RETURN,
      sourceId: params.saleId,
      description: params.description,
      lines,
      createdBy: params.createdBy,
      session: params.session,
    });
  }

  /**
   * Purchase return (or the remainder reversed by Cancel purchase after earlier returns).
   * Cr Inventory for the returned value; the debit side is settled against what is owed
   * to the vendor (AP), then refunded by the vendor (Cash/Bank) or kept as Vendor Advances.
   */
  async postPurchaseReturnEntry(params: {
    tenantId: string;
    branchId: string;
    purchaseId: string;
    vendorId: string;
    entryDate: Date;
    description: string;
    isCancellation: boolean;
    amount: number;
    applied: number;
    refund: number;
    refundMethod?: PaymentMethod;
    credit: number;
    createdBy: string;
    session: ClientSession;
  }): Promise<JournalEntryDocument> {
    const accounts = await this.ensureDefaultAccounts(params.tenantId, params.session);
    const party = { partyType: PartyType.VENDOR, partyId: params.vendorId };
    const lines: PostLineInput[] = [];
    if (params.applied > 0)
      lines.push({ accountId: accounts.get('ACCOUNTS_PAYABLE')!.id, debit: params.applied, credit: 0, ...party, description: 'Debit for returned goods' });
    if (params.refund > 0)
      lines.push({
        accountId: accounts.get(params.refundMethod && params.refundMethod !== PaymentMethod.CASH ? 'BANK' : 'CASH')!.id,
        debit: params.refund,
        credit: 0,
        description: 'Refund received for returned goods',
      });
    if (params.credit > 0)
      lines.push({ accountId: accounts.get('VENDOR_ADVANCES')!.id, debit: params.credit, credit: 0, ...party, description: 'Credit kept with vendor for returned goods' });
    if (params.amount > 0)
      lines.push({ accountId: accounts.get('INVENTORY')!.id, debit: 0, credit: params.amount, description: 'Inventory reduced on return' });

    return this.postJournalEntry({
      tenantId: params.tenantId,
      branchId: params.branchId,
      entryDate: params.entryDate,
      sourceType: params.isCancellation
        ? JournalEntrySourceType.PURCHASE_CANCELLATION
        : JournalEntrySourceType.PURCHASE_RETURN,
      sourceId: params.purchaseId,
      description: params.description,
      lines,
      createdBy: params.createdBy,
      session: params.session,
    });
  }

  /**
   * The one sanctioned in-place edit of a posted entry: a customer cash-receipt payment's own entry (cash debit,
   * receivable credit) gets a new amount and, optionally, a new date. Anything else, such as an entry that was
   * reversed, removed or has more lines, is refused so the immutable ledger is never touched by accident. The caller
   * (a cash-receipt transaction edit) keeps the before/after in its own history.
   */
  async editReceiptPaymentEntry(
    tenantId: string,
    paymentId: string,
    amount: number,
    entryDate: Date | undefined,
    session: ClientSession,
    party: PartyType = PartyType.CUSTOMER,
  ): Promise<void> {
    const entry = await this.findLiveReceiptEntry(tenantId, paymentId, session, party);
    // Customer receipt: Dr Cash / Cr Accounts Receivable. Vendor payment: Dr Accounts Payable / Cr Cash.
    const vendor = party === PartyType.VENDOR;
    const debitLine = entry.lines.find((l) =>
      vendor ? l.debit > 0 && l.partyType === party : l.debit > 0 && !l.partyId,
    );
    const creditLine = entry.lines.find((l) =>
      vendor ? l.credit > 0 && !l.partyId : l.credit > 0 && l.partyType === party,
    );
    if (entry.lines.length !== 2 || !debitLine || !creditLine) {
      throw new ConflictException("This payment's ledger posting cannot be edited in place");
    }
    debitLine.debit = amount;
    creditLine.credit = amount;
    entry.totalDebit = amount;
    entry.totalCredit = amount;
    if (entryDate) entry.entryDate = entryDate;
    entry.markModified('lines');
    await entry.save({ session });
  }

  /**
   * In-place edit of a cash-receipt payment's entry when it carries (or should now carry) a difference: the cash and
   * receivable/payable lines take the new amount, and the two "Difference" lines are rewritten, added or dropped to
   * match `difference`. The same entry, number and date stay; only its lines and totals change.
   */
  async editReceiptPaymentEntryWithDifference(
    tenantId: string,
    paymentId: string,
    change: { amount: number; difference: number; differenceAccountId?: string; entryDate?: Date },
    session: ClientSession,
    party: PartyType = PartyType.CUSTOMER,
  ): Promise<void> {
    const entry = await this.findLiveReceiptEntry(tenantId, paymentId, session, party);
    const vendor = party === PartyType.VENDOR;
    const baseLines = entry.lines.filter((l) => l.description !== DIFFERENCE_LINE_DESCRIPTION);
    const oldDifferenceLines = entry.lines.filter((l) => l.description === DIFFERENCE_LINE_DESCRIPTION);
    const debitLine = baseLines.find((l) =>
      vendor ? l.debit > 0 && l.partyType === party : l.debit > 0 && !l.partyId,
    );
    const creditLine = baseLines.find((l) =>
      vendor ? l.credit > 0 && !l.partyId : l.credit > 0 && l.partyType === party,
    );
    if (baseLines.length !== 2 || !debitLine || !creditLine) {
      throw new ConflictException("This payment's ledger posting cannot be edited in place");
    }
    debitLine.debit = change.amount;
    creditLine.credit = change.amount;

    const partyLine = vendor ? debitLine : creditLine;
    const differenceLines: PostLineInput[] = [];
    if (change.difference > 0) {
      const accounts = await this.ensureDefaultAccounts(tenantId, session);
      if (vendor) {
        // Dr Accounts Payable / Cr Purchase Discount.
        differenceLines.push(
          {
            accountId: accounts.get('ACCOUNTS_PAYABLE')!.id,
            debit: change.difference,
            credit: 0,
            partyType: PartyType.VENDOR,
            partyId: partyLine.partyId,
            description: DIFFERENCE_LINE_DESCRIPTION,
          },
          {
            accountId: accounts.get('PURCHASE_DISCOUNT')!.id,
            debit: 0,
            credit: change.difference,
            description: DIFFERENCE_LINE_DESCRIPTION,
          },
        );
      } else {
        // Dr Difference expense / Cr Accounts Receivable. The expense account of an existing difference stays.
        const expenseAccountId =
          oldDifferenceLines.find((l) => l.debit > 0)?.accountId ?? change.differenceAccountId;
        if (!expenseAccountId) throw new ConflictException('The Difference account is not set up');
        differenceLines.push(
          {
            accountId: expenseAccountId,
            debit: change.difference,
            credit: 0,
            description: DIFFERENCE_LINE_DESCRIPTION,
          },
          {
            accountId: accounts.get('ACCOUNTS_RECEIVABLE')!.id,
            debit: 0,
            credit: change.difference,
            partyType: PartyType.CUSTOMER,
            partyId: partyLine.partyId,
            description: DIFFERENCE_LINE_DESCRIPTION,
          },
        );
      }
    }

    const total = round2(change.amount + change.difference);
    entry.lines = [...baseLines, ...differenceLines] as typeof entry.lines;
    entry.totalDebit = total;
    entry.totalCredit = total;
    if (change.entryDate) entry.entryDate = change.entryDate;
    entry.markModified('lines');
    await entry.save({ session });
  }

  /** Takes a cash-receipt payment's entry out of the ledger (soft delete); see `editReceiptPaymentEntry`. */
  async removeReceiptPaymentEntry(
    tenantId: string,
    paymentId: string,
    session: ClientSession,
    party: PartyType = PartyType.CUSTOMER,
  ): Promise<void> {
    const entry = await this.findLiveReceiptEntry(tenantId, paymentId, session, party);
    entry.deletedAt = new Date();
    await entry.save({ session });
  }

  private async findLiveReceiptEntry(
    tenantId: string,
    paymentId: string,
    session: ClientSession,
    party: PartyType = PartyType.CUSTOMER,
  ) {
    const entry = await this.journalEntryModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        sourceType:
          party === PartyType.VENDOR
            ? JournalEntrySourceType.PAYMENT_MADE
            : JournalEntrySourceType.PAYMENT_RECEIVED,
        sourceId: paymentId,
        status: JournalEntryStatus.POSTED,
        deletedAt: null,
      })
      .session(session);
    if (!entry)
      throw new ConflictException("This payment's ledger posting was already reversed or removed");
    return entry;
  }

  private async reverseEntry(
    tenantId: string,
    branchId: string | null,
    originalSourceType: JournalEntrySourceType,
    sourceId: string,
    reversalSourceType: JournalEntrySourceType,
    description: string,
    createdBy: string,
    session: ClientSession,
  ): Promise<JournalEntryDocument | null> {
    const original = await this.journalEntryModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        sourceType: originalSourceType,
        sourceId,
        status: JournalEntryStatus.POSTED,
      })
      .session(session);
    if (!original) return null;

    const reversedLines: PostLineInput[] = original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      partyType: line.partyType,
      partyId: line.partyId,
      description: line.description,
    }));

    const reversal = await this.postJournalEntry({
      tenantId,
      branchId,
      entryDate: new Date(),
      sourceType: reversalSourceType,
      sourceId,
      description,
      lines: reversedLines,
      createdBy,
      session,
    });

    original.status = JournalEntryStatus.REVERSED;
    original.reversedByEntryId = reversal.id;
    await original.save({ session });

    reversal.reversalOfEntryId = original.id;
    await reversal.save({ session });

    return reversal;
  }
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
