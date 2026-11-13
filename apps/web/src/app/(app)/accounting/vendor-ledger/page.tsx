'use client';

import { useMemo } from 'react';
import { useVendors } from '@/hooks/use-vendors';
import { PartyLedgerPage, type PartyLedgerConfig } from '@/components/ledger/party-ledger-page';

function useVendorOptions() {
  const { vendors } = useVendors();
  return useMemo(() => vendors.map((v) => ({ value: v.id, label: v.company })), [vendors]);
}

const config: PartyLedgerConfig = {
  kind: 'vendors',
  singular: 'Vendor',
  plural: 'vendors',
  description: 'Purchases, payments, advances, returns and reversals per vendor, from posted entries.',
  billedLabel: 'Total purchased',
  settledLabel: 'Total paid',
  voidLabel: 'Reversed (edits & cancellations)',
  accountLabel: 'Accounts Payable',
  positiveHint: 'You owe the vendor',
  negativeHint: 'Advance with the vendor',
  useOptions: useVendorOptions,
};

export default function VendorLedgerPage() {
  return <PartyLedgerPage config={config} />;
}
