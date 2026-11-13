import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AuthenticatedUser, AuthResponse, SystemRole, TenantStatus, UserStatus } from '@medicore/shared-types';
import { runWithoutTenantScope } from '../../common/tenancy/tenant-context';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { LoginDto } from './dto/login.dto';
import { UserDocument } from '../users/schemas/user.schema';
import {
  ImpersonationLog,
  ImpersonationLogDocument,
} from '../platform/schemas/impersonation-log.schema';

const IMPERSONATION_TTL_SECONDS = 30 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
    @InjectModel(ImpersonationLog.name)
    private readonly impersonationLogModel: Model<ImpersonationLogDocument>,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    // Pre-auth: no tenant is known yet, so look the username up across tenants and let the password
    // (and, if needed, the organization code) pick the account.
    let candidates = await runWithoutTenantScope(async () => this.usersService.findAllByUsername(dto.username));
    if (dto.organization) {
      const tenant = await this.tenantsService.findBySlug(dto.organization.trim().toLowerCase());
      candidates = tenant ? candidates.filter((u) => u.tenantId.equals(tenant._id)) : [];
    }

    const matches: UserDocument[] = [];
    for (const candidate of candidates) {
      if (await bcrypt.compare(dto.password, candidate.passwordHash)) matches.push(candidate);
    }
    if (matches.length === 0) {
      throw new UnauthorizedException('Invalid username or password');
    }
    if (matches.length > 1) {
      throw new ConflictException(
        'This account exists in more than one organization. Enter your organization code to continue.',
      );
    }
    const user = matches[0];

    // A SUPER_ADMIN's own (reserved) tenant is never suspended in practice,
    // but never let a suspension of it lock the platform owner out.
    if (user.systemRole !== SystemRole.SUPER_ADMIN) {
      const tenant = await this.tenantsService.findById(user.tenantId.toString());
      if (!tenant || tenant.status === TenantStatus.SUSPENDED) {
        throw new UnauthorizedException(
          'Your organization has been suspended. Contact your administrator.',
        );
      }
    }

    return this.buildAuthResponse(user);
  }

  async impersonateTenantAdmin(superAdminId: string, tenantId: string): Promise<AuthResponse> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new BadRequestException('Cannot log in to a suspended tenant');
    }

    const admin = await this.usersService.findAdminForTenant(tenantId);
    if (!admin) {
      throw new NotFoundException('Tenant has no admin user');
    }
    if (admin.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Tenant admin user is not active');
    }

    const session = await this.impersonationLogModel.create({
      superAdminId: new Types.ObjectId(superAdminId),
      tenantId: admin.tenantId,
      targetUserId: admin._id,
      expiresAt: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000),
    });
    this.logger.warn(
      `Super admin ${superAdminId} impersonated ${admin.username} (tenant ${tenantId})`,
    );

    return this.buildAuthResponse(admin, {
      impersonatedBy: superAdminId,
      sessionId: session._id.toString(),
      expiresIn: IMPERSONATION_TTL_SECONDS,
    });
  }

  /** Ends the caller's impersonation session so its token stops working immediately. */
  async endImpersonation(user: AuthenticatedUser): Promise<{ ended: boolean }> {
    if (!user.impersonatedBy || !user.impersonationSessionId) {
      throw new ForbiddenException('Not an impersonation session');
    }
    const res = await this.impersonationLogModel.updateOne(
      { _id: new Types.ObjectId(user.impersonationSessionId), endedAt: { $exists: false } },
      { $set: { endedAt: new Date(), endReason: 'EXIT' } },
    );
    this.logger.warn(
      `Super admin ${user.impersonatedBy} exited impersonation of tenant ${user.tenantId} (session ${user.impersonationSessionId})`,
    );
    return { ended: res.modifiedCount > 0 };
  }

  private buildAuthResponse(
    user: UserDocument,
    impersonation?: { impersonatedBy: string; sessionId: string; expiresIn: number },
  ): AuthResponse {
    const branchId = user.branchId?.toString();
    const payload = {
      sub: user._id.toString(),
      tenantId: user.tenantId.toString(),
      username: user.username,
      tenantRole: user.tenantRole,
      // an impersonation token must look like a plain tenant user, never a platform one
      systemRole: impersonation ? undefined : user.systemRole,
      branchId,
      impersonatedBy: impersonation?.impersonatedBy,
      impersonationSessionId: impersonation?.sessionId,
    };

    return {
      accessToken: this.jwtService.sign(
        payload,
        impersonation ? { expiresIn: impersonation.expiresIn } : undefined,
      ),
      user: {
        userId: user._id.toString(),
        tenantId: user.tenantId.toString(),
        username: user.username,
        tenantRole: user.tenantRole,
        systemRole: impersonation ? undefined : user.systemRole,
        branchId,
        impersonatedBy: impersonation?.impersonatedBy,
        impersonationSessionId: impersonation?.sessionId,
      },
    };
  }
}
