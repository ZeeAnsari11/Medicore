'use client';

import { Suspense } from 'react';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Alert } from '@medicore/ui';
import { useGeneralLedger } from '@/hooks/use-ledgers';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useUrlState } from '@/hooks/use-url-state';
import { defaultRange, LedgerFilters } from '@/components/ledger/ledger-filters';
import { LedgerTable } from '@/components/ledger/ledger-table';
import { LedgerExportButtons } from '@/components/ledger/ledger-export-buttons';

const spinner = (
  <div className="flex h-96 items-center justify-center">
    <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
  </div>
);

function GeneralLedgerContent() {
  const url = useUrlState();

  const accountId = url.get('account');
  const branchFilter = useBranchFilter(url.get('branch'));
  const branchId = branchFilter.branchId;
  const def = defaultRange();
  const from = url.get('from') || def.from;
  const to = url.get('to') || def.to;
  const page = Number(url.get('page')) || 1;
  const limit = Number(url.get('limit')) || 50;

  const { ledger, isLoading, isFetching, error } = useGeneralLedger(accountId || null, {
    branchId: branchId || undefined,
    from,
    to,
    page,
    limit,
  });

  return (
    <>

      <PageHeader
        back={{ href: '/accounting', label: 'Back to Accounting' }} title="Journal Ledger" description="Every posted line across all accounts." />

      <div className="sticky top-0 z-10 -mx-1 mb-4 space-y-3 bg-background/95 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <LedgerExportButtons
              permission="acc_general_ledger:export"
              path="/accounting/general-ledger/export"
              query={{ accountId: accountId || undefined, branchId: branchId || undefined, from, to }}
              baseName={`general-ledger-${from}-to-${to}`}
              disabled={!ledger}
            />
        </div>
        <LedgerFilters
          from={from}
          to={to}
          branchFilter={branchFilter}
          onChange={(patch) => url.set({ ...patch, from: patch.from ?? from, to: patch.to ?? to, page: null })}
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load the ledger</span>
        </Alert>
      ) : isLoading || !ledger ? (
        spinner
      ) : (
        <div className="space-y-3">
          <LedgerTable
            variant="gl"
            ledger={ledger}
            closingLabel="Closing balance"
            isFetching={isFetching}
            onPageChange={(p) => url.set({ page: String(p) })}
            onLimitChange={(l) => url.set({ limit: String(l), page: null })}
          />
        </div>
      )}
    </>
  );
}

export default function GeneralLedgerPage() {
  return (
    <PageAccessGuard requires="acc_general_ledger:read">
      <Suspense fallback={spinner}>
        <GeneralLedgerContent />
      </Suspense>
    </PageAccessGuard>
  );
}
