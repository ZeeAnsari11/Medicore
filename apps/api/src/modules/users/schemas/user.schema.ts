import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SystemRole, TenantRole, UserStatus } from '@medicore/shared-types';

export type UserDocument = HydratedDocument<User>;

/** Location for accounts created outside the user form (tenant admins, platform admin, backfilled users). */
export const UNASSIGNED_LOCATION = {
  territory: 'Unassigned',
  city: 'Unassigned',
  address: 'Unassigned',
};

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
  })
  username: string;

  @Prop({ trim: true })
  phone?: string;

  // Users created before these fields existed are backfilled by scripts/user-location-backfill.ts.
  @Prop({ required: true, trim: true })
  territory: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop({ required: true, enum: TenantRole, default: TenantRole.TENANT_USER })
  tenantRole: TenantRole;

  @Prop({ enum: SystemRole })
  systemRole?: SystemRole;

  @Prop({ type: Types.ObjectId, ref: 'Role' })
  roleId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch' })
  branchId?: Types.ObjectId;

  /** Per-user tweaks on top of the role's permissions: effective = role + grant - deny. */
  @Prop({
    type: { grant: { type: [String], default: [] }, deny: { type: [String], default: [] } },
    default: () => ({ grant: [], deny: [] }),
    _id: false,
  })
  permissionOverrides: { grant: string[]; deny: string[] };
}

export const UserSchema = SchemaFactory.createForClass(User);

// A username is unique within a tenant, not across tenants.
UserSchema.index({ tenantId: 1, username: 1 }, { unique: true });
// Login looks users up by username before the tenant is known.
UserSchema.index({ username: 1 }, { name: 'username_lookup' });
