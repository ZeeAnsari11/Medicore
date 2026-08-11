import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthResponse } from '@medicore/shared-types';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
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

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: UserDocument): AuthResponse {
    const payload = {
      sub: user._id.toString(),
      tenantId: user.tenantId.toString(),
      email: user.email,
      tenantRole: user.tenantRole,
      systemRole: user.systemRole,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        userId: user._id.toString(),
        tenantId: user.tenantId.toString(),
        email: user.email,
        tenantRole: user.tenantRole,
        systemRole: user.systemRole,
      },
    };
  }
}
