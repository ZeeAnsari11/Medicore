import { Truck } from 'lucide-react';
import { ComingSoonPage } from '@/components/layout/coming-soon-page';

export default function VendorsPage() {
  return (
    <ComingSoonPage
      title="Vendors"
      description="Manage the distributors and suppliers you purchase medicine from."
      icon={Truck}
    />
  );
}
