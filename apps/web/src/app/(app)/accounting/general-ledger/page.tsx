'use client';

import { Suspense, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Alert, ComboboxWithCreate } from '@medicore/ui';
import { useAccounts } from '@/hooks/use-accounts';
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
  const router = useRouter();
  const url = useUrlState();
  const { accounts } = useAccounts();

  const accountId = url.get('account');
  const branchFilter = useBranchFilter(url.get('branch'));
  const branchId = branchFilter.branchId;
  const def = defaultRange();
  const from = url.get('from') || def.from;
  const to = url.get('to') || def.to;
  const page = Number(url.get('page')) || 1;
  const limit = Number(url.get('limit')) || 50;

  const options = useMemo(
    () => [...accounts].sort((a, b) => a.code.localeCompare(b.code)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    [accounts],
  );

  const { ledger, isLoading, isFetching, error } = useGeneralLedger(accountId || null, {
    branchId: branchId || undefined,
    from,
    to,
    page,
    limit,
  });

  return (
    <>
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader title="General Ledger" description="Every posted line for an account, with opening and closing balance." />

      <div className="sticky top-0 z-10 -mx-1 mb-4 space-y-3 bg-background/95 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ComboboxWithCreate
            options={options}
            value={accountId}
            onChange={(v) => url.set({ account: v, page: null })}
            placeholder="Select an account"
            searchPlaceholder="Search accounts..."
            emptyMessage="No accounts found."
            className="w-72"
          />
          {accountId && (
            <LedgerExportButtons
              permission="acc_general_ledger:export"
              path="/accounting/general-ledger/export"
              query={{ accountId, branchId: branchId || undefined, from, to }}
              baseName={`general-ledger-${from}-to-${to}`}
              disabled={!ledger}
            />
          )}
        </div>
        <LedgerFilters
          from={from}
          to={to}
          branchFilter={branchFilter}
          onChange={(patch) => url.set({ ...patch, from: patch.from ?? from, to: patch.to ?? to, page: null })}
        />
      </div>

      {!accountId ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Select an account to view its ledger.</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load the ledger</span>
        </Alert>
      ) : isLoading || !ledger ? (
        spinner
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {ledger.accountCode} · {ledger.accountName} — {ledger.normalBalance === 'DEBIT' ? 'debit' : 'credit'}-normal account
          </p>
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
