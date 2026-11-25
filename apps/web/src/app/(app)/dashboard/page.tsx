'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@medicore/ui';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAccountingOverview } from '@/hooks/use-ledger-reports';
import { useRealtimeInvalidation } from '@/hooks/use-realtime';
import { defaultRange, LedgerFilters } from '@/components/ledger/ledger-filters';
import { OverviewSection } from '@/components/dashboard/overview-section';
import { SalesReportSection } from '@/components/dashboard/sales-report-section';
import { InventoryReportSection } from '@/components/dashboard/inventory-report-section';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  return (
    <PageAccessGuard requires="dashboard:read">
      <DashboardContent />
    </PageAccessGuard>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const { has } = usePermissions();

  const [range, setRange] = useState(defaultRange);
  // Admins pick a branch (main by default, or all); everyone else is fixed to their own.
  const branchFilter = useBranchFilter();
  const branchId = branchFilter.branchId;

  const { connected, lastEventAt } = useRealtimeInvalidation(branchId);

  const canAccounting = has('acc_overview:read');
  const canSummary = has('dashboard:read');
  const canSales = has('sales:read') && has('reports:read');
  const canInventory = has('inventory:read') && has('reports:read');

  return (
    <>
      <PageHeader
        title={`Welcome back${user?.username ? `, ${user.username}` : ''}`}
        description="Here's what's happening across your distribution business."
        actions={<LiveIndicator connected={connected} lastEventAt={lastEventAt} />}
      />

      {(canSales || canInventory || canAccounting) && (
        <div className="mb-6">
          <LedgerFilters
            from={range.from}
            to={range.to}
            branchFilter={branchFilter}
            onChange={(patch) => {
              if (patch.from !== undefined || patch.to !== undefined) {
                setRange((r) => ({ from: patch.from ?? r.from, to: patch.to ?? r.to }));
              }
            }}
          />
        </div>
      )}

      <div className="space-y-10">
        {canSummary && <OverviewSection branchId={branchId} />}
        {canAccounting && <FinanceKpis branchId={branchId} />}
        {canSales && <SalesReportSection branchId={branchId} startDate={range.from} endDate={range.to} />}
        {canInventory && <InventoryReportSection branchId={branchId} startDate={range.from} endDate={range.to} />}
        {!canAccounting && !canSummary && !canSales && !canInventory && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            You don&apos;t have access to any dashboard reports yet. Ask an administrator for report access.
          </p>
        )}
      </div>
    </>
  );
}

function FinanceKpis({ branchId }: { branchId: string | null }) {
  const { overview } = useAccountingOverview(branchId);
  const cards = [
    { title: 'Accounts Receivable', value: overview?.totalReceivable, href: '/accounting/customer-ledger?view=list&bal=1' },
    { title: 'Accounts Payable', value: overview?.totalPayable, href: '/accounting/vendor-ledger?view=list&bal=1' },
    { title: 'Cash + Bank', value: overview?.cashAndBankBalance },
    { title: 'Net Income (this month)', value: overview?.netIncomeThisMonth },
  ];
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Finance</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className={cn('relative', card.href && 'transition-colors hover:bg-muted/40')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.href ? (
                  <Link href={card.href} className="after:absolute after:inset-0">
                    {card.title}
                  </Link>
                ) : (
                  card.title
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{(card.value ?? 0).toFixed(2)}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function LiveIndicator({ connected, lastEventAt }: { connected: boolean; lastEventAt: Date | null }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
      )}
      role="status"
      title={lastEventAt ? `Last change received ${lastEventAt.toLocaleTimeString()}` : undefined}
    >
      <span className={cn('size-1.5 rounded-full', connected ? 'animate-pulse bg-success' : 'bg-muted-foreground')} />
      {connected ? 'Live' : 'Reconnecting…'}
      {connected && lastEventAt && <span className="font-normal opacity-80">· updated {lastEventAt.toLocaleTimeString()}</span>}
    </span>
  );
}
