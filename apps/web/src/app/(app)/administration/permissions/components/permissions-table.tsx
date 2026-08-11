'use client';

import { MoreHorizontal } from 'lucide-react';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import type { Permission } from '@medicore/shared-types';

interface PermissionsTableProps {
  permissions: Permission[];
  onEdit: (id: string) => void;
  onView: (id: string) => void;
}

export function PermissionsTable({ permissions, onEdit, onView }: PermissionsTableProps) {
  const { has } = usePermissions();

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Module</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map((permission) => (
            <TableRow key={permission.id} onClick={() => onView(permission.id)} className="cursor-pointer">
              <TableCell>
                <code className="rounded bg-muted px-2 py-1 text-xs font-mono">{permission.key}</code>
              </TableCell>
              <TableCell>{permission.name}</TableCell>
              <TableCell>{permission.module}</TableCell>
              <TableCell>
                <Badge variant={permission.isSystem ? 'secondary' : 'default'}>
                  {permission.isSystem ? 'System' : 'Custom'}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={permission.isActive ? 'default' : 'outline'}>
                  {permission.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                {!permission.isSystem && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <button className="p-1 hover:bg-muted rounded">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(permission.id);
                        }}
                        disabled={!has('permissions:update')}
                      >
                        Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
