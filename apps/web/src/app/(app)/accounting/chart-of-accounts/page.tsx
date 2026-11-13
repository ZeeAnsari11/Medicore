'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  type ColumnDef,
} from '@medicore/ui';
import { useAccounts } from '@/hooks/use-accounts';
import { usePermissions } from '@/hooks/use-permissions';
import { AccountDialog } from './components/account-dialog';
import type { Account } from '@medicore/shared-types';

type DialogMode = 'create' | 'edit' | null;

export default function ChartOfAccountsPage() {
  const router = useRouter();
  const { accounts, isLoading, error, remove } = useAccounts();
  const { has } = usePermissions();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? accounts.find((a) => a.id === selectedId) : undefined;

  const columns = useMemo<ColumnDef<Account>[]>(
    () => [
      { accessorKey: 'code', header: 'Code' },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'type', header: 'Type' },
      {
        id: 'system',
        header: '',
        cell: ({ row }) => (row.original.isSystemAccount ? <Badge variant="outline">System</Badge> : null),
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ getValue }) => <Badge variant={getValue() ? 'default' : 'secondary'}>{getValue() ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-1 hover:bg-muted">⋯</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!has('acc_chart_of_accounts:update')}
                onClick={() => {
                  setSelectedId(row.original.id);
                  setDialogMode('edit');
                }}
              >
                Edit
              </DropdownMenuItem>
              {!row.original.isSystemAccount && (
                <DropdownMenuItem
                  disabled={!has('acc_chart_of_accounts:delete')}
                  className="text-destructive"
                  onClick={() => remove(row.original.id)}
                >
                  Deactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [has, remove],
  );

  return (
    <PageAccessGuard requires="acc_chart_of_accounts:read">
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Chart of Accounts"
        description="Default accounts are seeded automatically; add custom accounts as needed."
        actions={
          <Button disabled={!has('acc_chart_of_accounts:update')} onClick={() => { setSelectedId(null); setDialogMode('create'); }}>
            <Plus className="mr-2 h-4 w-4" />
            New Account
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load accounts</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={accounts}
          searchPlaceholder="Search accounts..."
          onRowClick={(row) => {
            if (!has('acc_chart_of_accounts:update')) return;
            setSelectedId(row.id);
            setDialogMode('edit');
          }}
        />
      )}

      <AccountDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        account={selected}
        onOpenChange={(open) => !open && setDialogMode(null)}
      />
    </PageAccessGuard>
  );
}
