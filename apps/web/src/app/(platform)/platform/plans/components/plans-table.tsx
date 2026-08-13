'use client';

import { MoreHorizontal } from 'lucide-react';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import { usePlatformPlans } from '@/hooks/use-platform-plans';
import { PlanStatus } from '@medicore/shared-types';
import type { Plan } from '@medicore/shared-types';

interface PlansTableProps {
  plans: Plan[];
  onEdit: (id: string) => void;
}

const statusVariants: Record<PlanStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  [PlanStatus.ACTIVE]: 'success',
  [PlanStatus.ARCHIVED]: 'secondary',
};

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(priceCents / 100);
}

export function PlansTable({ plans, onEdit }: PlansTableProps) {
  const { setStatus } = usePlatformPlans();

  const handleToggleStatus = async (plan: Plan) => {
    const nextStatus = plan.status === PlanStatus.ACTIVE ? PlanStatus.ARCHIVED : PlanStatus.ACTIVE;
    await setStatus(plan.id, nextStatus);
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Billing</TableHead>
            <TableHead>Max users</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan.id}>
              <TableCell className="font-medium">{plan.name}</TableCell>
              <TableCell className="text-sm">{formatPrice(plan.priceCents, plan.currency)}</TableCell>
              <TableCell className="text-sm capitalize">{plan.billingInterval.toLowerCase()}</TableCell>
              <TableCell className="text-sm">{plan.maxUsers ?? 'Unlimited'}</TableCell>
              <TableCell>
                <Badge variant={statusVariants[plan.status]}>{plan.status}</Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 hover:bg-muted rounded">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(plan.id)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggleStatus(plan)}>
                      {plan.status === PlanStatus.ACTIVE ? 'Archive' : 'Activate'}
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
