'use client';

import { useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Badge, DataTable, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Switch, type ColumnDef } from '@medicore/ui';
import { useManufacturers } from '@/hooks/use-manufacturers';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranches } from '@/hooks/use-branches';
import type { Manufacturer } from '@medicore/shared-types';

interface ManufacturersTableProps {
  manufacturers: Manufacturer[];
  onEdit: (id: string) => void;
  /** The rows left after the table's search, for a report. */
  onFilteredRowsChange?: (rows: Manufacturer[]) => void;
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

export function ManufacturersTable({ manufacturers, onEdit, onFilteredRowsChange }: ManufacturersTableProps) {
  const { has } = usePermissions();
  const { setStatus } = useManufacturers();
  const { branches } = useBranches();
  const canEdit = has('manufacturers:update');

  const columns = useMemo<ColumnDef<Manufacturer>[]>(() => {
    const branchName = (id?: string) => (id ? (branches.find((b) => b.id === id)?.name ?? '—') : 'All branches');
    const toggle = async (m: Manufacturer) => {
      try {
        await setStatus(m.id, !m.isActive);
      } catch {
        // Error is already handled by the hook
      }
    };
    return [
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: 'branch', header: 'Branch', accessorFn: (m) => branchName(m.branchId), cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue() as string}</span> },
      { id: 'country', header: 'Country', accessorFn: (m) => m.country ?? '', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { id: 'contact', header: 'Contact', accessorFn: (m) => m.contactPhone ?? '', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{(getValue() as string) || '—'}</span> },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (m) => (m.isActive ? 'Active' : 'Inactive'),
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'default' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        id: 'active',
        header: 'Active',
        enableSorting: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch checked={row.original.isActive} onCheckedChange={() => toggle(row.original)} disabled={!canEdit} />
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
          </RowActions>
        ),
      },
    ];
  }, [branches, canEdit, onEdit, setStatus]);

  return (
    <DataTable
      columns={columns}
      data={manufacturers}
      searchPlaceholder="Search manufacturers..."
      onRowClick={(m) => canEdit && onEdit(m.id)}
      onFilteredRowsChange={onFilteredRowsChange}
    />
  );
}
