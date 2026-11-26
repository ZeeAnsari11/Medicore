import type { FundsAccount } from './loan';

/** What paid for the asset: Cash or Bank, or EXISTING for an asset the business already owned (booked against opening equity). */
export type AssetSource = FundsAccount | 'EXISTING';

/** Something long-lived the business owns, kept at cost until it is sold or written off (no depreciation). */
export interface FixedAsset {
  id: string;
  branchId: string;
  /** Running number per tenant (1, 2, 3 ...). */
  assetNumber?: number;
  name: string;
  cost: number;
  purchaseDate: string;
  source: AssetSource;
  notes?: string;
  /** The cost while ACTIVE, 0 once disposed of. */
  bookValue: number;
  status: 'ACTIVE' | 'DISPOSED';
  disposal?: { date: string; proceeds: number; method: FundsAccount; gainLoss: number };
}

export interface CreateFixedAssetRequest {
  branchId?: string;
  name: string;
  cost: number;
  purchaseDate?: string;
  source: AssetSource;
  notes?: string;
}

export interface DisposeFixedAssetRequest {
  date?: string;
  /** What it was sold for; 0 for a write-off. */
  proceeds: number;
  method: FundsAccount;
}
