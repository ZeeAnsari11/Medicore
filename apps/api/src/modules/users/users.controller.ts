import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermission('users:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const users = await this.usersService.findAllForTenant(user.tenantId);
    return users.map((u) => this.usersService.toUserResponse(u));
  }

  @RequirePermission('users:read')
  @Get(':id')
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const foundUser = await this.usersService.findByIdForTenant(user.tenantId, id);
    if (!foundUser) {
      throw new NotFoundException('User not found');
    }
    return this.usersService.toUserResponse(foundUser);
  }

  @RequirePermission('users:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    const { user: newUser, temporaryPassword } = await this.usersService.createForTenant(
      user.tenantId,
      dto,
    );
    return {
      ...this.usersService.toUserResponse(newUser),
      temporaryPassword,
    };
  }

  @RequirePermission('users:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const updatedUser = await this.usersService.updateForTenant(user.tenantId, id, dto, user.userId);
    return this.usersService.toUserResponse(updatedUser);
  }

  @RequirePermission('users:deactivate')
  @Patch(':id/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const updatedUser = await this.usersService.setStatus(user.tenantId, id, dto.status, user.userId);
    return this.usersService.toUserResponse(updatedUser);
  }

  @RequirePermission('users:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.usersService.deleteForTenant(user.tenantId, id, user.userId);
  }
}
