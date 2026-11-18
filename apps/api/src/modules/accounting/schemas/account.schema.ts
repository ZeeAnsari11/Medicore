import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { AccountType, NormalBalance } from '@medicore/shared-types';

export type AccountDocument = HydratedDocument<Account>;

/**
 * Chart of Accounts entry. Tenant-wide (not branch-scoped) — matches how
 * Customer/Vendor are tenant-wide master data; a branch is a location a
 * transaction happens at, not a separate ledger. `systemKey` lets the
 * posting engine reliably resolve "the AR account" etc. regardless of
 * what display name a tenant gives it — never resolved by name.
 */
@Schema({ timestamps: true, collection: 'accounts' })
export class Account {
  @Prop({ type: String, default: () => uuidv7() })
  _id: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: AccountType })
  type: AccountType;

  @Prop({ required: true, enum: NormalBalance })
  normalBalance: NormalBalance;

  @Prop({ trim: true })
  systemKey?: string;

  @Prop({ type: String })
  parentAccountId?: string;

  @Prop({ required: true, default: false })
  isSystemAccount: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const AccountSchema = SchemaFactory.createForClass(Account);

AccountSchema.index({ tenantId: 1, code: 1 }, { unique: true });
// A compound `sparse` index only skips a document when EVERY indexed field is absent, and tenantId is always
// present, so accounts without a systemKey (all user-created ones) would collide after the first. A partial
// index on "systemKey is a string" is what sparse was meant to express (same fix as Product.barcode).
AccountSchema.index(
  { tenantId: 1, systemKey: 1 },
  { unique: true, partialFilterExpression: { systemKey: { $type: 'string' } } },
);
