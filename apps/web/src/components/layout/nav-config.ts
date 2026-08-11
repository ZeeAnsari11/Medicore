import {
  LayoutDashboard,
  Factory,
  Truck,
  Pill,
  ShoppingCart,
  Boxes,
  Receipt,
  Users,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Manufacturers', href: '/manufacturers', icon: Factory, comingSoon: true },
      { label: 'Vendors', href: '/vendors', icon: Truck, comingSoon: true },
      { label: 'Products', href: '/products', icon: Pill, comingSoon: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Purchases', href: '/purchases', icon: ShoppingCart, comingSoon: true },
      { label: 'Inventory', href: '/inventory', icon: Boxes, comingSoon: true },
      { label: 'Sales', href: '/sales', icon: Receipt, comingSoon: true },
      { label: 'Customers', href: '/customers', icon: Users, comingSoon: true },
    ],
  },
  {
    title: 'Insights',
    items: [{ label: 'Reports', href: '/reports', icon: BarChart3, comingSoon: true }],
  },
  {
    title: 'Workspace',
    items: [{ label: 'Settings', href: '/settings', icon: Settings }],
  },
];
