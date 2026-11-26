'use client';

import { useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Badge, DataTable, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, type ColumnDef } from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import type { Permission } from '@medicore/shared-types';

interface PermissionsTableProps {
  permissions: Permission[];
  onEdit: (id: string) => void;
  onView: (id: string) => void;
}

export function PermissionsTable({ permissions, onEdit, onView }: PermissionsTableProps) {
  const { has } = usePermissions();

  const columns = useMemo<ColumnDef<Permission>[]>(
    () => [
      { accessorKey: 'key', header: 'Key', cell: ({ row }) => <code className="rounded bg-muted px-2 py-1 text-xs font-mono">{row.original.key}</code> },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'module', header: 'Module' },
      {
        id: 'scope',
        header: 'Scope',
        accessorFn: (p) => (p.isSystem ? 'System' : 'Custom'),
        cell: ({ row }) => <Badge variant={row.original.isSystem ? 'secondary' : 'default'}>{row.original.isSystem ? 'System' : 'Custom'}</Badge>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (p) => (p.isActive ? 'Active' : 'Inactive'),
        cell: ({ row }) => <Badge variant={row.original.isActive ? 'default' : 'outline'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.isSystem ? null : (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 hover:bg-muted rounded" aria-label="Row actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(row.original.id)} disabled={!has('permissions:update')}>
                    Edit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
      },
    ],
    [has, onEdit],
  );

  return <DataTable columns={columns} data={permissions} searchPlaceholder="Search permissions..." onRowClick={(p) => onView(p.id)} />;
}
