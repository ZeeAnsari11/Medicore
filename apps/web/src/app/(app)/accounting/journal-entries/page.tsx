'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import { ReportButton } from '@/components/layout/report-button';
import { useShownRows } from '@/hooks/use-shown-rows';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  type ColumnDef,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useJournalEntries } from '@/hooks/use-journal-entries';
import { JournalEntryStatus } from '@medicore/shared-types';
import type { JournalEntry } from '@medicore/shared-types';
import { JournalEntryDialog } from './components/journal-entry-dialog';
import { JournalEntryDetailDialog } from './components/journal-entry-detail-dialog';
import { OpenFromUrl } from '@/components/open-from-url';


export default function JournalEntriesPage() {
  const { has } = usePermissions();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);

  const { entries, isLoading, error } = useJournalEntries(selectedBranchId);
  // Only receipts entered on this screen; system entries (sales, payments, expenses...) live in their own pages and the ledgers.
  const receipts = useMemo(() => entries.filter((e) => e.sourceType === 'MANUAL'), [entries]);
  const shown = useShownRows(receipts);

  // Opened from a link elsewhere (?open=<id>), e.g. a ledger row.
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!openId) return;
    const match = entries.find((e) => e.id === openId);
    if (match) {
      setDetailEntry(match);
      setOpenId(null);
    }
  }, [openId, entries]);


  const columns = useMemo<ColumnDef<JournalEntry>[]>(
    () => [
      { accessorKey: 'entryNumber', header: 'Entry #' },
      { accessorKey: 'entryDate', header: 'Date', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
      {
        accessorKey: 'sourceType',
        header: 'Source',
        cell: ({ getValue }) => <Badge variant="outline">{(getValue() as string).replace(/_/g, ' ')}</Badge>,
      },
      { accessorKey: 'description', header: 'Description' },
      { accessorKey: 'totalDebit', header: 'Debit', cell: ({ getValue }) => (getValue() as number).toFixed(2) },
      { accessorKey: 'totalCredit', header: 'Credit', cell: ({ getValue }) => (getValue() as number).toFixed(2) },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as JournalEntryStatus;
          return <Badge variant={status === JournalEntryStatus.REVERSED ? 'secondary' : 'default'}>{status}</Badge>;
        },
      },
    ],
    [],
  );

  return (
    <PageAccessGuard requires="acc_journal_entries:read">

      <PageHeader
        report={<ReportButton
          title="General Receipts"
          totalColumns={['Debit', 'Credit']}
          rows={shown.rows.map((e) => ({
            'Entry #': e.entryNumber,
            Date: new Date(e.entryDate).toLocaleDateString('en-CA'),
            Source: e.sourceType.replace(/_/g, ' '),
            Description: e.description,
            Debit: e.totalDebit.toFixed(2),
            Credit: e.totalCredit.toFixed(2),
            Status: e.status,
          }))}
        />}
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        title="General Receipts"
        description="Record money received that is not a sale, plus every posted entry — sales, purchases, payments, expenses and returns."
        actions={
          <div className="flex items-center gap-3">
            <Button disabled={!has('acc_journal_entries:create')} onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Receipt
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load journal entries</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <DataTable
          onFilteredRowsChange={shown.onFilteredRowsChange}
          columns={columns}
          data={receipts}
          searchPlaceholder="Search entries..."
          onRowClick={(row) => setDetailEntry(row)}
        />
      )}

      <JournalEntryDialog open={dialogOpen} branchId={selectedBranchId} onOpenChange={setDialogOpen} />
      <Suspense fallback={null}>
        <OpenFromUrl onOpen={setOpenId} />
      </Suspense>

      <JournalEntryDetailDialog entry={detailEntry} onOpenChange={(open) => !open && setDetailEntry(null)} />
    </PageAccessGuard>
  );
}
