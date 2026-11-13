import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { PermissionResolverService } from '../roles/permission-resolver.service';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const resolved = await this.permissionResolver.resolve(user);
    const record = await this.usersService.findById(user.userId);
    return {
      ...user,
      fullName: record?.fullName,
      permissions: resolved.permissions,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('impersonation/exit')
  exitImpersonation(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.endImpersonation(user);
  }
}
