import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { JournalEntry, JournalEntryDocument } from './schemas/journal-entry.schema';
import { AccountingPostingService } from './accounting-posting.service';
import { CreateManualJournalEntryDto } from './dto/create-manual-journal-entry.dto';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { JournalEntrySourceType } from '@medicore/shared-types';
import type { JournalEntry as JournalEntryType } from '@medicore/shared-types';

@Injectable()
export class JournalEntriesService {
  constructor(
    @InjectModel(JournalEntry.name) private readonly journalEntryModel: Model<JournalEntryDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly postingService: AccountingPostingService,
  ) {}

  async listForTenant(
    tenantId: string,
    branchId: string | null,
    sourceType?: JournalEntrySourceType,
  ) {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    if (sourceType) filter.sourceType = sourceType;
    return this.journalEntryModel.find(filter).sort({ entryDate: -1, createdAt: -1 });
  }

  async findOne(tenantId: string, id: string) {
    const entry = await this.journalEntryModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  async createManualEntry(tenantId: string, userId: string, dto: CreateManualJournalEntryDto) {
    const session = await this.connection.startSession();
    try {
      let result: JournalEntryDocument | null = null;
      await session.withTransaction(async () => {
        result = await this.postingService.postJournalEntry({
          tenantId,
          branchId: dto.branchId ?? null,
          entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
          sourceType: JournalEntrySourceType.MANUAL,
          description: dto.description,
          lines: dto.lines,
          createdBy: userId,
          session,
        });
      });
      return result!;
    } finally {
      await session.endSession();
    }
  }

  async createOpeningBalance(tenantId: string, userId: string, dto: CreateOpeningBalanceDto) {
    const session = await this.connection.startSession();
    try {
      let result: JournalEntryDocument | null = null;
      await session.withTransaction(async () => {
        result = await this.postingService.postJournalEntry({
          tenantId,
          branchId: dto.branchId ?? null,
          entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
          sourceType: JournalEntrySourceType.OPENING_BALANCE,
          description: dto.description ?? 'Opening balance',
          lines: dto.lines,
          createdBy: userId,
          session,
        });
      });
      return result!;
    } finally {
      await session.endSession();
    }
  }

  toJournalEntryResponse(entry: JournalEntryDocument): JournalEntryType {
    const obj = entry.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      branchId: obj.branchId ? obj.branchId.toString() : undefined,
      entryNumber: obj.entryNumber,
      entryDate: obj.entryDate.toISOString(),
      sourceType: obj.sourceType,
      sourceId: obj.sourceId,
      description: obj.description,
      lines: obj.lines,
      totalDebit: obj.totalDebit,
      totalCredit: obj.totalCredit,
      status: obj.status,
      reversalOfEntryId: obj.reversalOfEntryId,
      reversedByEntryId: obj.reversedByEntryId,
      createdBy: obj.createdBy.toString(),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
