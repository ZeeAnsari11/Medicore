import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '@medicore/shared-types';

interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  tenantRole: AuthenticatedUser['tenantRole'];
  systemRole?: AuthenticatedUser['systemRole'];
  branchId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      tenantRole: payload.tenantRole,
      systemRole: payload.systemRole,
      branchId: payload.branchId,
    };
  }
}
