import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthResponse, SystemRole, TenantStatus } from '@medicore/shared-types';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { LoginDto } from './dto/login.dto';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // A SUPER_ADMIN's own (reserved) tenant is never suspended in practice,
    // but never let a suspension of it lock the platform owner out.
    if (user.systemRole !== SystemRole.SUPER_ADMIN) {
      const tenant = await this.tenantsService.findById(user.tenantId.toString());
      if (!tenant || tenant.status === TenantStatus.SUSPENDED) {
        throw new UnauthorizedException('Your organization has been suspended. Contact your administrator.');
      }
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: UserDocument): AuthResponse {
    const branchId = user.branchId?.toString();
    const payload = {
      sub: user._id.toString(),
      tenantId: user.tenantId.toString(),
      email: user.email,
      tenantRole: user.tenantRole,
      systemRole: user.systemRole,
      branchId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        userId: user._id.toString(),
        tenantId: user.tenantId.toString(),
        email: user.email,
        tenantRole: user.tenantRole,
        systemRole: user.systemRole,
        branchId,
      },
    };
  }
}
