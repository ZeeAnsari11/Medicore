import { Building2, CreditCard, LayoutDashboard, Layers, Settings } from 'lucide-react';

export const platformNavSections = [
  {
    label: 'Platform',
    items: [
      {
        label: 'Dashboard',
        href: '/platform/dashboard',
        icon: LayoutDashboard,
      },
      {
        label: 'Tenants',
        href: '/platform/tenants',
        icon: Building2,
      },
      {
        label: 'Subscriptions',
        href: '/platform/subscriptions',
        icon: CreditCard,
      },
      {
        label: 'Plans',
        href: '/platform/plans',
        icon: Layers,
      },
      {
        label: 'Settings',
        href: '/platform/settings',
        icon: Settings,
      },
    ],
  },
];
