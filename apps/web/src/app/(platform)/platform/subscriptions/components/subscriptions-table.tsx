'use client';

import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import { usePlatformSubscriptions } from '@/hooks/use-platform-subscriptions';
import { usePlatformPlans } from '@/hooks/use-platform-plans';
import { SubscriptionStatus } from '@medicore/shared-types';
import type { SubscriptionWithDetails } from '@medicore/shared-types';

interface SubscriptionsTableProps {
  subscriptions: SubscriptionWithDetails[];
}

const statusVariants: Record<SubscriptionStatus, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  [SubscriptionStatus.TRIALING]: 'warning',
  [SubscriptionStatus.ACTIVE]: 'success',
  [SubscriptionStatus.PAST_DUE]: 'destructive',
  [SubscriptionStatus.CANCELED]: 'secondary',
};

export function SubscriptionsTable({ subscriptions }: SubscriptionsTableProps) {
  const { assignPlan, setStatus } = usePlatformSubscriptions();
  const { plans } = usePlatformPlans();

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tenant</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Renews / ends</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscriptions.map((subscription) => (
            <TableRow key={subscription.id}>
              <TableCell className="font-medium">{subscription.tenant.name}</TableCell>
              <TableCell>
                <Select
                  value={subscription.plan.id}
                  onValueChange={(planId) => assignPlan(subscription.tenantId, planId)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariants[subscription.status]}>{subscription.status}</Badge>
                  <Select
                    value={subscription.status}
                    onValueChange={(status) =>
                      setStatus(subscription.tenantId, status as SubscriptionStatus)
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(SubscriptionStatus).map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
