import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { JournalEntriesService } from './journal-entries.service';
import { CreateManualJournalEntryDto } from './dto/create-manual-journal-entry.dto';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveBranchScope, resolveCreateBranch } from '../../common/branch/branch-scope.util';
import { JournalEntrySourceType } from '@medicore/shared-types';
import type { AuthenticatedUser } from '@medicore/shared-types';

@Controller('accounting/journal-entries')
export class JournalEntriesController {
  constructor(private readonly journalEntriesService: JournalEntriesService) {}

  @RequirePermission('acc_journal_entries:read')
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('sourceType') sourceType?: JournalEntrySourceType,
  ) {
    const scope = resolveBranchScope(user, branchId);
    const entries = await this.journalEntriesService.listForTenant(
      user.tenantId,
      scope,
      sourceType,
    );
    return entries.map((e) => this.journalEntriesService.toJournalEntryResponse(e));
  }

  @RequirePermission('acc_journal_entries:read')
  @Get(':id')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const entry = await this.journalEntriesService.findOne(user.tenantId, id);
    return this.journalEntriesService.toJournalEntryResponse(entry);
  }

  @RequirePermission('acc_journal_entries:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateManualJournalEntryDto) {
    const entry = await this.journalEntriesService.createManualEntry(user.tenantId, user.userId, {
      ...dto,
      branchId: resolveCreateBranch(user, dto.branchId),
    });
    return this.journalEntriesService.toJournalEntryResponse(entry);
  }
}

@Controller('accounting/opening-balances')
export class OpeningBalancesController {
  constructor(private readonly journalEntriesService: JournalEntriesService) {}

  @RequirePermission('acc_journal_entries:create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOpeningBalanceDto) {
    const entry = await this.journalEntriesService.createOpeningBalance(user.tenantId, user.userId, {
      ...dto,
      branchId: resolveCreateBranch(user, dto.branchId),
    });
    return this.journalEntriesService.toJournalEntryResponse(entry);
  }
}
