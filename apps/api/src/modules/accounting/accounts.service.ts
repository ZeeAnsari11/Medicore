import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Account, AccountDocument } from './schemas/account.schema';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountingPostingService } from './accounting-posting.service';
import type { Account as AccountType } from '@medicore/shared-types';
import { NormalBalance } from '@medicore/shared-types';

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

  async create(tenantId: string, dto: CreateAccountDto) {
    const existing = await this.accountModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      code: dto.code,
    });
    if (existing) throw new ConflictException(`An account with code "${dto.code}" already exists`);

    const normalBalance =
      dto.type === 'ASSET' || dto.type === 'EXPENSE' ? NormalBalance.DEBIT : NormalBalance.CREDIT;

    return this.accountModel.create({
      tenantId: new Types.ObjectId(tenantId),
      code: dto.code,
      name: dto.name,
      type: dto.type,
      normalBalance,
      parentAccountId: dto.parentAccountId,
      description: dto.description,
      isSystemAccount: false,
      isActive: true,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAccountDto) {
    const account = await this.accountModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (dto.name !== undefined) account.name = dto.name;
    if (dto.description !== undefined) account.description = dto.description;
    if (dto.isActive !== undefined) {
      if (account.isSystemAccount && dto.isActive === false) {
        throw new BadRequestException('System accounts cannot be deactivated');
      }
      account.isActive = dto.isActive;
    }
    return account.save();
  }

  async remove(tenantId: string, id: string) {
    const account = await this.accountModel.findOne({
      _id: id,
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.isSystemAccount) throw new BadRequestException('System accounts cannot be deleted');
    account.deletedAt = new Date();
    account.isActive = false;
    await account.save();
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
