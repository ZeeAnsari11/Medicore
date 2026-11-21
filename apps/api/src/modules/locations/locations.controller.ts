import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsMongoId, IsOptional } from 'class-validator';
import { LocationsService } from './locations.service';
import { CreateCityDto, CreateTerritoryDto, UpdateCityDto, UpdateTerritoryDto } from './dto/location.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { resolveBranchScope, resolveCreateBranch } from '../../common/branch/branch-scope.util';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '@medicore/shared-types';

class LocationQuery {
  /** Admins may name any branch of the tenant; branch users can only name their own. */
  @IsMongoId()
  @IsOptional()
  branchId?: string;
}

class TerritoryQuery extends LocationQuery {
  @IsMongoId()
  @IsOptional()
  cityId?: string;
}

/** Lists are per branch, like customers. Reading them is also allowed with customers:read, so whoever fills the customer form can use the dropdowns. */
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @RequirePermission('locations:read', 'customers:read')
  @Get('cities')
  async cities(@CurrentUser() user: AuthenticatedUser, @Query() query: LocationQuery) {
    return (await this.locations.listCities(user.tenantId, resolveBranchScope(user, query.branchId))).map((c) => this.locations.toCityResponse(c));
  }

  @RequirePermission('locations:create')
  @Post('cities')
  async createCity(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCityDto) {
    return this.locations.toCityResponse(await this.locations.createCity(user.tenantId, resolveCreateBranch(user, dto.branchId), dto));
  }

  @RequirePermission('locations:update')
  @Patch('cities/:id')
  async updateCity(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCityDto) {
    return this.locations.toCityResponse(await this.locations.updateCity(user.tenantId, id, dto));
  }

  @RequirePermission('locations:read', 'customers:read')
  @Get('territories')
  async territories(@CurrentUser() user: AuthenticatedUser, @Query() query: TerritoryQuery) {
    return (await this.locations.listTerritories(user.tenantId, resolveBranchScope(user, query.branchId), query.cityId)).map((t) => this.locations.toTerritoryResponse(t));
  }

  @RequirePermission('locations:create')
  @Post('territories')
  async createTerritory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTerritoryDto) {
    return this.locations.toTerritoryResponse(await this.locations.createTerritory(user.tenantId, dto));
  }

  @RequirePermission('locations:update')
  @Patch('territories/:id')
  async updateTerritory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTerritoryDto) {
    return this.locations.toTerritoryResponse(await this.locations.updateTerritory(user.tenantId, id, dto));
  }
}
