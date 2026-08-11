'use client';

import { MoreHorizontal } from 'lucide-react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Switch } from '@medicore/ui';
import { useUsers } from '@/hooks/use-users';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@medicore/ui';
import type { User, UserStatus } from '@medicore/shared-types';

interface UsersTableProps {
  users: User[];
  onEdit: (id: string) => void;
}

const statusVariants: Record<UserStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  ACTIVE: 'default',
  INVITED: 'secondary',
  DISABLED: 'destructive',
};

export function UsersTable({ users, onEdit }: UsersTableProps) {
  const { has } = usePermissions();
  const { setStatus } = useUsers();

  const handleToggleStatus = async (user: User) => {
    try {
      const newStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      await setStatus(user.id, newStatus);
    } catch (err) {
      // Error is already handled by the hook
    }
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Tenant Role</TableHead>
            <TableHead>Assigned Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16">Active</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.fullName}</TableCell>
              <TableCell className="text-sm">{user.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{user.tenantRole}</Badge>
              </TableCell>
              <TableCell className="text-sm">
                {user.role?.name || '—'}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariants[user.status]}>
                  {user.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={user.status === 'ACTIVE'}
                  onCheckedChange={() => handleToggleStatus(user)}
                  disabled={!has('users:deactivate')}
                />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 hover:bg-muted rounded">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => onEdit(user.id)}
                      disabled={!has('users:update')}
                    >
                      Edit
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
