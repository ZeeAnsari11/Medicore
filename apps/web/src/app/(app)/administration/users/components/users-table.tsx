'use client';

import { useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Badge, DataTable, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Switch, type ColumnDef } from '@medicore/ui';
import { useUsers } from '@/hooks/use-users';
import { usePermissions } from '@/hooks/use-permissions';
import type { User } from '@medicore/shared-types';
import { UserStatus } from '@medicore/shared-types';

interface UsersTableProps {
  users: User[];
  onEdit: (id: string) => void;
  /** The rows left after the table's search, for a report. */
  onFilteredRowsChange?: (rows: User[]) => void;
}

const statusVariants: Record<UserStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  ACTIVE: 'default',
  INVITED: 'secondary',
  DISABLED: 'destructive',
};

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

export function UsersTable({ users, onEdit, onFilteredRowsChange }: UsersTableProps) {
  const { has } = usePermissions();
  const { setStatus } = useUsers();
  const canEdit = has('users:update');

  const columns = useMemo<ColumnDef<User>[]>(() => {
    const toggle = async (user: User) => {
      try {
        await setStatus(user.id, user.status === UserStatus.ACTIVE ? UserStatus.DISABLED : UserStatus.ACTIVE);
      } catch {
        // Error is already handled by the hook
      }
    };
    return [
      { accessorKey: 'fullName', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span> },
      { accessorKey: 'username', header: 'Username' },
      { id: 'phone', header: 'Phone', accessorFn: (u) => u.phone ?? '', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'tenantRole', header: 'Tenant Role', cell: ({ row }) => <Badge variant="secondary">{row.original.tenantRole}</Badge> },
      { id: 'role', header: 'Assigned Role', accessorFn: (u) => u.role?.name ?? '', cell: ({ getValue }) => (getValue() as string) || '—' },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant={statusVariants[row.original.status]}>{row.original.status}</Badge> },
      {
        id: 'active',
        header: 'Active',
        enableSorting: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch checked={row.original.status === 'ACTIVE'} onCheckedChange={() => toggle(row.original)} disabled={!has('users:deactivate')} />
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
  }, [canEdit, has, onEdit, setStatus]);

  return (
    <DataTable
      columns={columns}
      data={users}
      searchPlaceholder="Search users..."
      onRowClick={(u) => canEdit && onEdit(u.id)}
      onFilteredRowsChange={onFilteredRowsChange}
    />
  );
}
