'use client';

import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { PartyType } from '@medicore/shared-types';
import { PartyPaymentsView } from './components/party-payments-view';

export default function PaymentsPage() {
  return (
    <PageAccessGuard requires="acc_payments:read">
      <PartyPaymentsView partyType={PartyType.VENDOR} />
    </PageAccessGuard>
  );
}
