import { ShoppingCart } from 'lucide-react';
import { ComingSoonPage } from '@/components/layout/coming-soon-page';

export default function PurchasesPage() {
  return (
    <ComingSoonPage
      title="Purchases"
      description="Purchase orders and vendor invoices for restocking inventory."
      icon={ShoppingCart}
    />
  );
}
