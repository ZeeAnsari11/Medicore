'use client';

import { useMemo } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Badge, DataTable, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Switch, toast, type ColumnDef } from '@medicore/ui';
import { useRoles } from '@/hooks/use-roles';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import type { Role } from '@medicore/shared-types';

interface RolesTableProps {
  roles: Role[];
  onEdit: (id: string) => void;
  /** The rows left after the table's search, for a report. */
  onFilteredRowsChange?: (rows: Role[]) => void;
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

export function RolesTable({ roles, onEdit, onFilteredRowsChange }: RolesTableProps) {
  const { has } = usePermissions();
  const { setStatus, delete: deleteRole, isDeleting } = useRoles();
  const canEdit = has('roles:update');

  const columns = useMemo<ColumnDef<Role>[]>(() => {
    const toggle = async (role: Role) => {
      try {
        await setStatus(role.id, !role.isActive);
      } catch {
        // Error is already handled by the hook
      }
    };
    const remove = async (id: string) => {
      if (!confirm('Are you sure you want to delete this role?')) return;
      try {
        await deleteRole(id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) toast.error('Role is assigned to users. Deactivate it instead.');
      }
    };
    return [
      { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: 'description', header: 'Description', accessorFn: (r) => r.description ?? '', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { id: 'modules', header: 'Modules', accessorFn: (r) => r.allowedModules.length, cell: ({ row }) => <Badge variant="outline">{row.original.allowedModules.length} module(s)</Badge> },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (r) => (r.isActive ? 'Active' : 'Inactive'),
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
            <DropdownMenuItem onClick={() => remove(row.original.id)} disabled={!has('roles:delete') || isDeleting} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </RowActions>
        ),
      },
    ];
  }, [canEdit, deleteRole, has, isDeleting, onEdit, setStatus]);

  return (
    <DataTable
      columns={columns}
      data={roles}
      searchPlaceholder="Search roles..."
      onRowClick={(r) => canEdit && onEdit(r.id)}
      onFilteredRowsChange={onFilteredRowsChange}
    />
  );
}
