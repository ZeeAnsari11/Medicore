'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from '@medicore/ui';
import { usePurchase } from '@/hooks/use-purchases';
import { PurchaseFormPage } from '../../components/purchase-form-page';

/** Edit an unpaid purchase. A locked or missing purchase goes back to the list with the reason. */
export default function EditPurchasePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const branchId = useSearchParams().get('branchId');
  const { purchase, isLoading } = usePurchase(id, branchId);

  const locked = !!purchase && purchase.isEditable === false;
  useEffect(() => {
    if (locked) {
      toast.error(`Purchase is locked: ${purchase?.lockReason ?? 'not editable'}`);
      router.replace('/purchases');
    }
  }, [locked, purchase?.lockReason, branchId, router]);

  if (isLoading || !purchase || locked) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }
  // Remount when a refetch changes the purchase so the form never shows stale lines.
  return <PurchaseFormPage key={`${purchase.id}-${purchase.updatedAt}`} editPurchase={purchase} />;
}
