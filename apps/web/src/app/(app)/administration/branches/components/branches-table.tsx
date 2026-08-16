'use client';

import { MoreHorizontal, Trash2 } from 'lucide-react';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Switch,
  toast,
} from '@medicore/ui';
import { useBranches } from '@/hooks/use-branches';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import type { Branch } from '@medicore/shared-types';

interface BranchesTableProps {
  branches: Branch[];
  onEdit: (id: string) => void;
}

export function BranchesTable({ branches, onEdit }: BranchesTableProps) {
  const { has } = usePermissions();
  const { setStatus, delete: deleteBranch, isDeleting } = useBranches();

  const handleToggleStatus = async (branch: Branch) => {
    try {
      await setStatus(branch.id, !branch.isActive);
    } catch {
      // Error is already handled by the hook
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this branch?')) {
      try {
        await deleteBranch(id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          toast.error(err.message);
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
            <TableHead>Code</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16">Active</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {branches.map((branch) => (
            <TableRow key={branch.id}>
              <TableCell className="font-medium">
                {branch.name}
                {branch.isMain && (
                  <Badge variant="outline" className="ml-2">
                    Main
                  </Badge>
                )}
              </TableCell>
              <TableCell>{branch.code}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{branch.address || '—'}</TableCell>
              <TableCell>
                <Badge variant={branch.isActive ? 'default' : 'secondary'}>
                  {branch.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={branch.isActive}
                  onCheckedChange={() => handleToggleStatus(branch)}
                  disabled={!has('branches:update') || branch.isMain}
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
                    <DropdownMenuItem onClick={() => onEdit(branch.id)} disabled={!has('branches:update')}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(branch.id)}
                      disabled={!has('branches:delete') || isDeleting || branch.isMain}
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
