'use client';

import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { PartyType } from '@medicore/shared-types';
import { PartyPaymentsView } from '../payments/components/party-payments-view';

export default function SaleReceiptsPage() {
  return (
    <PageAccessGuard requires="acc_payments:read">
      <PartyPaymentsView partyType={PartyType.CUSTOMER} />
    </PageAccessGuard>
  );
}
