import { BranchOwnedEntity } from './base';

/** A city in a branch's list; customers of that branch store its name in `Customer.city`. */
export interface City extends BranchOwnedEntity {
  name: string;
  isActive: boolean;
}

/** A territory (area) inside a city; customers store its name in `Customer.territory`. */
export interface Territory extends BranchOwnedEntity {
  cityId: string;
  name: string;
  isActive: boolean;
}

export interface CreateCityRequest {
  /** Admins must name the branch; branch users are pinned to their own. */
  branchId?: string;
  name: string;
}

export interface UpdateCityRequest {
  name?: string;
  isActive?: boolean;
}

export interface CreateTerritoryRequest {
  cityId: string;
  /** Optional: the territory always takes its city's branch. */
  branchId?: string;
  name: string;
}

export interface UpdateTerritoryRequest {
  name?: string;
  isActive?: boolean;
}
