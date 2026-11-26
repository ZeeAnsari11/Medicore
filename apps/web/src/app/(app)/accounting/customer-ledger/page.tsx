'use client';

import { customerOption } from '@/lib/party-label';
import { useMemo } from 'react';
import { useCustomers } from '@/hooks/use-customers';
import { PartyLedgerPage, type PartyLedgerConfig } from '@/components/ledger/party-ledger-page';

function useCustomerOptions() {
  const { customers } = useCustomers();
  return useMemo(() => customers.map(customerOption), [customers]);
}

const config: PartyLedgerConfig = {
  kind: 'customers',
  singular: 'Customer',
  plural: 'customers',
  description: 'Invoices, payments, advances, returns and voids per customer, from posted entries.',
  billedLabel: 'Total invoiced',
  settledLabel: 'Total received',
  voidLabel: 'Reversed (edits & voids)',
  accountLabel: 'Accounts Receivable',
  positiveHint: 'Customer owes you',
  negativeHint: 'Credit / advance with you',
  useOptions: useCustomerOptions,
};

export default function CustomerLedgerPage() {
  return <PartyLedgerPage config={config} />;
}
