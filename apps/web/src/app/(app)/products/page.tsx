import { Pill } from 'lucide-react';
import { ComingSoonPage } from '@/components/layout/coming-soon-page';

export default function ProductsPage() {
  return (
    <ComingSoonPage
      title="Products"
      description="Your product catalog, variants, and vendor-specific pricing."
      icon={Pill}
    />
  );
}
