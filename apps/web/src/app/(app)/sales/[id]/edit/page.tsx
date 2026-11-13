'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from '@medicore/ui';
import { useSale } from '@/hooks/use-sales';
import { SaleFormPage } from '../../components/sale-form-page';

/** Edit an unpaid sale. A locked or missing invoice goes back to the list with the reason. */
export default function EditSalePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const branchId = useSearchParams().get('branchId');
  const { sale, isLoading } = useSale(id, branchId);

  const locked = !!sale && sale.isEditable === false;
  useEffect(() => {
    if (locked) {
      toast.error(`Invoice is locked: ${sale?.lockReason ?? 'not editable'}`);
      router.replace('/sales');
    }
  }, [locked, sale?.lockReason, branchId, router]);

  if (isLoading || !sale || locked) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }
  // Remount when a refetch changes the invoice so the form never shows stale lines.
  return <SaleFormPage key={`${sale.id}-${sale.updatedAt}`} editSale={sale} />;
}
