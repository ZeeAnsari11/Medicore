import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { JournalEntrySourceType } from '@medicore/shared-types';
import type { FixedAsset as FixedAssetResponse } from '@medicore/shared-types';
import { FixedAsset, FixedAssetDocument } from './schemas/fixed-asset.schema';
import { AccountingPostingService, PostLineInput } from './accounting-posting.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { disposalGainLoss } from './fixed-asset-math';
import { explainUnexpected } from './unexpected-error';
import { CreateFixedAssetDto, DisposeFixedAssetDto } from './dto/fixed-asset.dto';

@Injectable()
export class FixedAssetsService {
  private readonly logger = new Logger(FixedAssetsService.name);

  constructor(
    @InjectModel(FixedAsset.name) private readonly assetModel: Model<FixedAssetDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly postingService: AccountingPostingService,
    private readonly sequenceService: SequenceService,
  ) {}

  async list(tenantId: string, branchId: string | null) {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId), deletedAt: null };
    if (branchId) filter.branchId = new Types.ObjectId(branchId);
    return this.assetModel.find(filter).sort({ purchaseDate: -1, createdAt: -1 });
  }

  /** Dr Fixed Assets, Cr Cash/Bank; an asset already owned is booked against Opening Balance Equity instead. */
  async create(tenantId: string, branchId: string, userId: string, dto: CreateFixedAssetDto): Promise<FixedAssetDocument> {
    const session = await this.connection.startSession();
    try {
      let result!: FixedAssetDocument;
      await session.withTransaction(async () => {
        const purchaseDate = dto.purchaseDate ? new Date(dto.purchaseDate) : new Date();
        const sourceKey = dto.source === 'EXISTING' ? 'OPENING_BALANCE_EQUITY' : dto.source;
        const acc = await this.postingService.resolveSystemAccounts(tenantId, ['FIXED_ASSETS', sourceKey] as const, session);
        const assets = acc.FIXED_ASSETS;
        const source = acc[sourceKey];
        const description = `${dto.source === 'EXISTING' ? 'Existing asset' : 'Asset purchase'}: ${dto.name}`;
        const lines: PostLineInput[] = [
          { accountId: assets.id, debit: dto.cost, credit: 0, description },
          { accountId: source.id, debit: 0, credit: dto.cost, description },
        ];
        const entry = await this.postingService.postJournalEntry({
          tenantId,
          branchId,
          entryDate: purchaseDate,
          sourceType: JournalEntrySourceType.ASSET_PURCHASE,
          description,
          lines,
          createdBy: userId,
          session,
        });
        const [created] = await this.assetModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              branchId: new Types.ObjectId(branchId),
              assetSeq: await this.sequenceService.next(tenantId, null, 'asset', session),
              name: dto.name,
              cost: dto.cost,
              purchaseDate,
              source: dto.source,
              notes: dto.notes,
              journalEntryId: entry.id,
              createdBy: new Types.ObjectId(userId),
            },
          ],
          { session },
        );
        result = created;
      });
      return result;
    } catch (error) {
      return explainUnexpected(this.logger, 'Adding the asset', error);
    } finally {
      await session.endSession();
    }
  }

  /** Dr Cash/Bank (proceeds), Cr Fixed Assets (cost); the difference is a gain or a loss. */
  async dispose(tenantId: string, assetId: string, userId: string, dto: DisposeFixedAssetDto): Promise<FixedAssetDocument> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const asset = await this.assetModel
          .findOne({ _id: assetId, tenantId: new Types.ObjectId(tenantId), deletedAt: null })
          .session(session);
        if (!asset) throw new NotFoundException('Asset not found');
        if (asset.status === 'DISPOSED') throw new BadRequestException('This asset was already disposed of');
        const gainLoss = disposalGainLoss(asset.cost, dto.proceeds);
        const acc = await this.postingService.resolveSystemAccounts(
          tenantId,
          ['FIXED_ASSETS', dto.method, 'DISPOSAL_GAIN_LOSS'] as const,
          session,
        );
        const assets = acc.FIXED_ASSETS;
        const funds = acc[dto.method];
        const disposal = acc.DISPOSAL_GAIN_LOSS;
        const description = `${dto.proceeds > 0 ? 'Sale' : 'Write-off'} of asset: ${asset.name}`;
        const lines: PostLineInput[] = [{ accountId: assets.id, debit: 0, credit: asset.cost, description }];
        if (dto.proceeds > 0) lines.push({ accountId: funds.id, debit: dto.proceeds, credit: 0, description });
        // Loss: debit the expense; gain: credit it (so it reduces expenses).
        if (gainLoss < 0) lines.push({ accountId: disposal.id, debit: -gainLoss, credit: 0, description });
        if (gainLoss > 0) lines.push({ accountId: disposal.id, debit: 0, credit: gainLoss, description });
        const date = dto.date ? new Date(dto.date) : new Date();
        const entry = await this.postingService.postJournalEntry({
          tenantId,
          branchId: String(asset.branchId),
          entryDate: date,
          sourceType: JournalEntrySourceType.ASSET_DISPOSAL,
          sourceId: asset.id,
          description,
          lines,
          createdBy: userId,
          session,
        });
        asset.status = 'DISPOSED';
        asset.disposal = { date, proceeds: dto.proceeds, method: dto.method, gainLoss, journalEntryId: entry.id };
        await asset.save({ session });
      });
    } catch (error) {
      return explainUnexpected(this.logger, 'Disposing of the asset', error);
    } finally {
      await session.endSession();
    }
    return (await this.assetModel.findOne({ _id: assetId, tenantId: new Types.ObjectId(tenantId) }))!;
  }

  toResponse(asset: FixedAssetDocument): FixedAssetResponse {
    const obj = asset.toObject();
    return {
      id: String(obj._id),
      branchId: String(obj.branchId),
      assetNumber: obj.assetSeq,
      name: obj.name,
      cost: obj.cost,
      purchaseDate: obj.purchaseDate.toISOString(),
      source: obj.source,
      notes: obj.notes,
      bookValue: obj.status === 'DISPOSED' ? 0 : obj.cost,
      status: obj.status,
      disposal: obj.disposal && {
        date: obj.disposal.date.toISOString(),
        proceeds: obj.disposal.proceeds,
        method: obj.disposal.method,
        gainLoss: obj.disposal.gainLoss,
      },
    };
  }
}
