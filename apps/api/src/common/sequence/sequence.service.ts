import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Counter, CounterDocument } from './schemas/counter.schema';

@Injectable()
export class SequenceService {
  constructor(@InjectModel(Counter.name) private readonly counterModel: Model<CounterDocument>) {}

  /**
   * Atomically issues the next number for (tenantId, branchId, type). Pass the
   * same Mongo session as the surrounding transaction so the increment commits
   * or rolls back with the rest of the write (e.g. Sale/Purchase creation).
   * branchId is null for sequences that aren't branch-specific (e.g. StockTransfer,
   * which spans two branches).
   */
  async next(
    tenantId: string,
    branchId: string | null,
    type: string,
    session?: ClientSession,
  ): Promise<number> {
    const counter = await this.counterModel.findOneAndUpdate(
      {
        tenantId: new Types.ObjectId(tenantId),
        branchId: branchId ? new Types.ObjectId(branchId) : null,
        type,
      },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session },
    );

    return counter.seq;
  }
}
