import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Account, AccountDocument } from './schemas/account.schema';
import { AccountingPostingService } from './accounting-posting.service';
import type { Account as AccountType } from '@medicore/shared-types';

@Injectable()
export class AccountsService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly postingService: AccountingPostingService,
  ) {}

  /** Ensures defaults exist, then returns the full active chart. */
  async list(tenantId: string) {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.postingService.ensureDefaultAccounts(tenantId, session);
      });
    } finally {
      await session.endSession();
    }
    return this.accountModel
      .find({ tenantId: new Types.ObjectId(tenantId), deletedAt: null })
      .sort({ code: 1 });
  }

  toAccountResponse(account: AccountDocument): AccountType {
    const obj = account.toObject() as any;
    return {
      id: obj._id.toString(),
      tenantId: obj.tenantId.toString(),
      code: obj.code,
      name: obj.name,
      type: obj.type,
      normalBalance: obj.normalBalance,
      systemKey: obj.systemKey,
      parentAccountId: obj.parentAccountId,
      isSystemAccount: obj.isSystemAccount,
      isActive: obj.isActive,
      description: obj.description,
      deletedAt: obj.deletedAt ? obj.deletedAt.toISOString() : null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
