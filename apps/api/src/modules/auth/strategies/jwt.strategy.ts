import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '@medicore/shared-types';
import { runWithoutTenantScope } from '../../../common/tenancy/tenant-context';
import { User, UserDocument } from '../../users/schemas/user.schema';

interface JwtPayload {
  sub: string;
  tenantId: string;
  username: string;
  tenantRole: AuthenticatedUser['tenantRole'];
  systemRole?: AuthenticatedUser['systemRole'];
  branchId?: string;
  impersonatedBy?: string;
  impersonationSessionId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Branch and tenant role drive data scoping, so take them from the database, not the 1-day token.
    // No user row (e.g. a platform admin without one) keeps the token's claims.
    const fresh = await runWithoutTenantScope(() =>
      this.userModel.findById(payload.sub).select('branchId tenantRole').lean().exec(),
    ).catch(() => null);
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      username: payload.username,
      tenantRole: (fresh?.tenantRole as AuthenticatedUser['tenantRole']) ?? payload.tenantRole,
      systemRole: payload.systemRole,
      branchId: fresh ? fresh.branchId?.toString() : payload.branchId,
      impersonatedBy: payload.impersonatedBy,
      impersonationSessionId: payload.impersonationSessionId,
    };
  }
}
