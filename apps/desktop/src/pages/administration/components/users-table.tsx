import { useState } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Switch, Button, Alert } from '@medicore/ui';
import { useUsers } from '@/hooks/use-users';
import { usePermissions } from '@/hooks/use-permissions';
import { UserStatus } from '@medicore/shared-types';
import type { User } from '@medicore/shared-types';

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
  const { setStatus, delete: deleteUser } = useUsers();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleToggleStatus = async (user: User) => {
    try {
      const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.DISABLED : UserStatus.ACTIVE;
      await setStatus(user.id, newStatus);
    } catch (err) {
      // Error is already handled by the hook
    }
  };

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map((u) => u.id)));
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        setDeleteError(null);
        await deleteUser(userId);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete user');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedIds.size} user${selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const userIds = Array.from(selectedIds);
      await Promise.all(userIds.map((id) => deleteUser(id)));
      setSelectedIds(new Set());
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete users');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div>
            <p className="text-sm font-medium">
              {selectedIds.size} user{selectedIds.size !== 1 ? 's' : ''} selected
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds(new Set())}
              disabled={isDeleting}
            >
              Deselect
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isDeleting || selectedIds.size === 0}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {deleteError && (
        <Alert variant="destructive">
          <span>{deleteError}</span>
        </Alert>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === users.length && users.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded"
                  disabled={!has('users:delete')}
                />
              </TableHead>
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
              <TableRow
                key={user.id}
                className={`${selectedIds.has(user.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''} cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors`}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(user.id)}
                    onChange={() => handleSelectUser(user.id)}
                    className="w-4 h-4 rounded"
                    disabled={!has('users:delete')}
                  />
                </TableCell>
                <TableCell className="font-medium cursor-pointer" onClick={() => onEdit(user.id)}>
                  {user.fullName}
                </TableCell>
                <TableCell className="text-sm cursor-pointer" onClick={() => onEdit(user.id)}>
                  {user.email}
                </TableCell>
                <TableCell className="cursor-pointer" onClick={() => onEdit(user.id)}>
                  <Badge variant="secondary">{user.tenantRole}</Badge>
                </TableCell>
                <TableCell className="text-sm cursor-pointer" onClick={() => onEdit(user.id)}>
                  {user.role?.name || '—'}
                </TableCell>
                <TableCell className="cursor-pointer" onClick={() => onEdit(user.id)}>
                  <Badge variant={statusVariants[user.status]}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={user.status === UserStatus.ACTIVE}
                    onCheckedChange={() => handleToggleStatus(user)}
                    disabled={!has('users:deactivate')}
                  />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
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
                      <DropdownMenuItem
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={!has('users:delete')}
                        className="text-red-600"
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
