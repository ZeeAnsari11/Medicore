import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBranchStatusDto } from './dto/update-branch-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @RequirePermission('branches:read')
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const branches = await this.branchesService.listForTenant(user.tenantId);
    return branches.map((branch) => this.branchesService.toBranchResponse(branch));
  }

  @RequirePermission('branches:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBranchDto) {
    const branch = await this.branchesService.createBranch(user.tenantId, dto);
    return this.branchesService.toBranchResponse(branch);
  }

  @RequirePermission('branches:update')
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    const branch = await this.branchesService.updateBranch(user.tenantId, id, dto);
    return this.branchesService.toBranchResponse(branch);
  }

  @RequirePermission('branches:update')
  @Patch(':id/status')
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchStatusDto,
  ) {
    const branch = await this.branchesService.setStatus(user.tenantId, id, dto.isActive);
    return this.branchesService.toBranchResponse(branch);
  }

  @RequirePermission('branches:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.branchesService.deleteBranch(user.tenantId, id);
  }
}
