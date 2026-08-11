import { Users } from 'lucide-react';
import { ComingSoonPage } from '@/components/layout/coming-soon-page';

export default function CustomersPage() {
  return (
    <ComingSoonPage
      title="Customers"
      description="Customer records, balances, and payment ledgers."
      icon={Users}
    />
  );
}
