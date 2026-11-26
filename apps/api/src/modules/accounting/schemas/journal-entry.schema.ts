import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BRANCH_SCOPED } from '../../../common/tenancy/branch-scope.plugin';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { JournalEntrySourceType, JournalEntryStatus, PartyType } from '@medicore/shared-types';

@Schema({ _id: false })
export class JournalEntryLine {
  @Prop({ required: true, type: String, ref: 'Account' })
  accountId: string;

  @Prop({ required: true, min: 0, default: 0 })
  debit: number;

  @Prop({ required: true, min: 0, default: 0 })
  credit: number;

  @Prop({ enum: PartyType })
  partyType?: PartyType;

  @Prop({ type: String })
  partyId?: string;

  @Prop({ trim: true })
  description?: string;
}

export const JournalEntryLineSchema = SchemaFactory.createForClass(JournalEntryLine);

export type JournalEntryDocument = HydratedDocument<JournalEntry>;

/**
 * The immutable ledger. Every posted entry's `lines` must balance
 * (Σdebit === Σcredit) — enforced by AccountingPostingService before
 * insert, not by a schema-level validator (Mongoose can't easily express
 * "sum of subdocument fields" as a path validator). Never edited after
 * posting: a correction is a new, equal-and-opposite entry referencing
 * this one via reversalOfEntryId, with this entry's status flipped to
 * REVERSED. There is intentionally no delete endpoint for posted entries.
 */
@Schema({ timestamps: true, collection: 'journal_entries', ...BRANCH_SCOPED })
export class JournalEntry {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Branch', index: true })
  branchId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  entryNumber: string;

  @Prop({ required: true })
  entryDate: Date;

  @Prop({ required: true, enum: JournalEntrySourceType })
  sourceType: JournalEntrySourceType;

  @Prop({ type: String, index: true })
  sourceId?: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ type: [JournalEntryLineSchema], required: true })
  lines: JournalEntryLine[];

  @Prop({ required: true, min: 0 })
  totalDebit: number;

  @Prop({ required: true, min: 0 })
  totalCredit: number;

  @Prop({ required: true, enum: JournalEntryStatus, default: JournalEntryStatus.POSTED })
  status: JournalEntryStatus;

  @Prop({ type: String })
  reversalOfEntryId?: string;

  @Prop({ type: String })
  reversedByEntryId?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const JournalEntrySchema = SchemaFactory.createForClass(JournalEntry);

// Entries are numbered 1, 2, 3, ... per business, so the number is unique within a tenant.
JournalEntrySchema.index({ tenantId: 1, branchId: 1, entryNumber: 1 }, { unique: true });
JournalEntrySchema.index({ tenantId: 1, branchId: 1, entryDate: -1 });
JournalEntrySchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 });
JournalEntrySchema.index({ tenantId: 1, 'lines.partyId': 1, entryDate: 1 });
JournalEntrySchema.index({ tenantId: 1, 'lines.accountId': 1, entryDate: 1 });

/**
 * Entries that count in balances and reports. A reversed original stays in, together with the
 * reversal entry that cancels it, so the pair nets to zero and the ledger keeps the history.
 * Counting only POSTED would drop the original but keep its reversal, double-counting every
 * cancelled or edited invoice.
 */
export const LEDGER_VISIBLE_STATUSES = [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED];
