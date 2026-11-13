import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AuthenticatedUser,
  OrderBookerOption,
  SystemRole,
  UserStatus,
} from '@medicore/shared-types';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PermissionResolverService } from '../roles/permission-resolver.service';
import { isAdminUser } from '../../common/branch/branch-scope.util';

export interface OrderBooker {
  id: string;
  name: string;
}

const asAuthUser = (u: UserDocument): AuthenticatedUser => ({
  userId: u.id,
  tenantId: u.tenantId.toString(),
  username: u.username,
  tenantRole: u.tenantRole,
  systemRole: u.systemRole,
  branchId: u.branchId?.toString(),
});

/** Who may be named as the Order Booker of a sale, and the name that gets stamped on it. */
@Injectable()
export class OrderBookersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  /** Eligible = active, same tenant, allowed in the branch (admins anywhere) and able to create sales. */
  private async eligible(
    tenantId: string,
    branchId: string | null,
    candidate: UserDocument,
  ): Promise<boolean> {
    if (candidate.status !== UserStatus.ACTIVE) return false;
    const auth = asAuthUser(candidate);
    const inBranch = isAdminUser(auth) || !branchId || candidate.branchId?.toString() === branchId;
    return inBranch && (await this.permissionResolver.has(auth, 'sales:create'));
  }

  /** Names for the New Sale select and the sales filter. An Order Booker only ever sees themselves. */
  async listOptions(
    user: AuthenticatedUser,
    branchId: string | null,
    canPickOthers: boolean,
  ): Promise<OrderBookerOption[]> {
    const filter: Record<string, unknown> = {
      tenantId: new Types.ObjectId(user.tenantId),
      status: UserStatus.ACTIVE,
      // Platform support accounts are not part of the tenant's sales team.
      systemRole: { $exists: false },
    };
    if (!canPickOthers) filter._id = new Types.ObjectId(user.userId);
    const users = await this.userModel
      .find(filter)
      .select('fullName tenantRole systemRole branchId status tenantId username')
      .sort({ fullName: 1 });
    const out: OrderBookerOption[] = [];
    for (const u of users) {
      if (u.id === user.userId || (await this.eligible(user.tenantId, branchId, u))) {
        out.push({ id: u.id, name: u.fullName });
      }
    }
    return out;
  }

  /**
   * The Order Booker for a new sale. The name always comes from the user record, never the client.
   * Booking for someone else needs `sales:book_for_others`; the target must be eligible for the branch.
   */
  async resolveForCreate(
    actor: AuthenticatedUser,
    branchId: string,
    requestedId: string | undefined,
    canBookForOthers: boolean,
  ): Promise<OrderBooker> {
    if (requestedId && requestedId !== actor.userId && !canBookForOthers) {
      throw new ForbiddenException('You can only book sales for yourself');
    }
    return this.resolveEligible(actor.tenantId, branchId, requestedId ?? actor.userId);
  }

  /** Target of a booking or reassignment: must exist in the tenant, be active, allowed in the branch and able to sell. */
  async resolveEligible(tenantId: string, branchId: string, userId: string): Promise<OrderBooker> {
    const target = await this.userModel.findOne({
      _id: new Types.ObjectId(userId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!target) throw new BadRequestException('Order Booker not found');
    if (target.status !== UserStatus.ACTIVE)
      throw new BadRequestException('Order Booker is not active');
    if (target.systemRole === SystemRole.SUPER_ADMIN)
      throw new BadRequestException('Order Booker not found');
    if (!(await this.eligible(tenantId, branchId, target))) {
      throw new ForbiddenException('That user cannot book sales in this branch');
    }
    return { id: target.id, name: target.fullName };
  }
}
