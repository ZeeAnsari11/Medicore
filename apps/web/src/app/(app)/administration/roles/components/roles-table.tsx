'use client';

import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Switch } from '@medicore/ui';
import { useRoles } from '@/hooks/use-roles';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from '@medicore/ui';
import { ApiError } from '@/lib/api-client';
import type { Role } from '@medicore/shared-types';

interface RolesTableProps {
  roles: Role[];
  onEdit: (id: string) => void;
}

export function RolesTable({ roles, onEdit }: RolesTableProps) {
  const { has } = usePermissions();
  const { setStatus, delete: deleteRole, isDeleting, deleteError } = useRoles();

  const handleToggleStatus = async (role: Role) => {
    try {
      await setStatus(role.id, !role.isActive);
    } catch (err) {
      // Error is already handled by the hook
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this role?')) {
      try {
        await deleteRole(id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          toast.error('Role is assigned to users. Deactivate it instead.');
        }
      }
    }
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16">Active</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">{role.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {role.description || '—'}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{role.permissions.length} permission(s)</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={role.isActive ? 'default' : 'secondary'}>
                  {role.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={role.isActive}
                  onCheckedChange={() => handleToggleStatus(role)}
                  disabled={!has('roles:update')}
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
                      onClick={() => onEdit(role.id)}
                      disabled={!has('roles:update')}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(role.id)}
                      disabled={!has('roles:delete') || isDeleting}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
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
  );
}
