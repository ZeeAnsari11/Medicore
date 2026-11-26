'use client';

import { useMemo } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Badge, DataTable, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Switch, toast, type ColumnDef } from '@medicore/ui';
import { useBranches } from '@/hooks/use-branches';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import type { Branch } from '@medicore/shared-types';

interface BranchesTableProps {
  branches: Branch[];
  onEdit: (id: string) => void;
  /** The rows left after the table's search, for a report. */
  onFilteredRowsChange?: (rows: Branch[]) => void;
}

function RowActions({ children }: { children: React.ReactNode }) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1 hover:bg-muted rounded" aria-label="Row actions">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{children}</DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function BranchesTable({ branches, onEdit, onFilteredRowsChange }: BranchesTableProps) {
  const { has } = usePermissions();
  const { setStatus, delete: deleteBranch, isDeleting } = useBranches();
  const canEdit = has('branches:update');

  const columns = useMemo<ColumnDef<Branch>[]>(() => {
    const toggle = async (b: Branch) => {
      try {
        await setStatus(b.id, !b.isActive);
      } catch {
        // Error is already handled by the hook
      }
    };
    const remove = async (id: string) => {
      if (!confirm('Are you sure you want to delete this branch?')) return;
      try {
        await deleteBranch(id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) toast.error(err.message);
      }
    };
    return [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.name}
            {row.original.isMain && (
              <Badge variant="outline" className="ml-2">
                Main
              </Badge>
            )}
          </span>
        ),
      },
      { accessorKey: 'code', header: 'Code' },
      { id: 'address', header: 'Address', accessorFn: (b) => b.address ?? '', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{(getValue() as string) || '—'}</span> },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (b) => (b.isActive ? 'Active' : 'Inactive'),
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'default' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        id: 'active',
        header: 'Active',
        enableSorting: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch checked={row.original.isActive} onCheckedChange={() => toggle(row.original)} disabled={!canEdit || row.original.isMain} />
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <RowActions>
            <DropdownMenuItem onClick={() => onEdit(row.original.id)} disabled={!canEdit}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => remove(row.original.id)}
              disabled={!has('branches:delete') || isDeleting || row.original.isMain}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </RowActions>
        ),
      },
    ];
  }, [canEdit, deleteBranch, has, isDeleting, onEdit, setStatus]);

  return (
    <DataTable
      columns={columns}
      data={branches}
      searchPlaceholder="Search branches..."
      onRowClick={(b) => canEdit && onEdit(b.id)}
      onFilteredRowsChange={onFilteredRowsChange}
    />
  );
}
