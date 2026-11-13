'use client';

import { MoreHorizontal } from 'lucide-react';
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
} from '@medicore/ui';
import { useManufacturers } from '@/hooks/use-manufacturers';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranches } from '@/hooks/use-branches';
import type { Manufacturer } from '@medicore/shared-types';

interface ManufacturersTableProps {
  manufacturers: Manufacturer[];
  onEdit: (id: string) => void;
}

export function ManufacturersTable({ manufacturers, onEdit }: ManufacturersTableProps) {
  const { has } = usePermissions();
  const { setStatus } = useManufacturers();
  const { branches } = useBranches();
  const branchName = (id?: string) => (id ? (branches.find((b) => b.id === id)?.name ?? '—') : 'All branches');

  const handleToggleStatus = async (manufacturer: Manufacturer) => {
    try {
      await setStatus(manufacturer.id, !manufacturer.isActive);
    } catch {
      // Error is already handled by the hook
    }
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16">Active</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {manufacturers.map((manufacturer) => (
            <TableRow
              key={manufacturer.id}
              onClick={() => has('manufacturers:update') && onEdit(manufacturer.id)}
              className={has('manufacturers:update') ? 'cursor-pointer' : undefined}
            >
              <TableCell className="font-medium">{manufacturer.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{branchName(manufacturer.branchId)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{manufacturer.country || '—'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {manufacturer.contactPhone || '—'}
              </TableCell>
              <TableCell>
                <Badge variant={manufacturer.isActive ? 'default' : 'secondary'}>
                  {manufacturer.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={manufacturer.isActive}
                  onCheckedChange={() => handleToggleStatus(manufacturer)}
                  disabled={!has('manufacturers:update')}
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
                    <DropdownMenuItem onClick={() => onEdit(manufacturer.id)} disabled={!has('manufacturers:update')}>
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
