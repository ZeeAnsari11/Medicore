import { Receipt } from 'lucide-react';
import { ComingSoonPage } from '@/components/layout/coming-soon-page';

export default function SalesPage() {
  return (
    <ComingSoonPage
      title="Sales"
      description="Sales invoices with FEFO-based batch allocation."
      icon={Receipt}
    />
  );
}
