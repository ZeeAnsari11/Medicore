import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionResolverService } from '../roles/permission-resolver.service';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionResolver: PermissionResolverService,
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
    return {
      ...user,
      permissions: resolved.permissions,
    };
  }
}
