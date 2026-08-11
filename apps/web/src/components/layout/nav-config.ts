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
  LockKeyhole,
  Shield,
  Key,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem, NavSection } from '@medicore/ui';

export const navSections: NavSection[] = [
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
    title: 'Administration',
    items: [
      { label: 'Permissions', href: '/administration/permissions', icon: Key, requires: { anyOf: ['permissions:read'] } },
      { label: 'Roles', href: '/administration/roles', icon: Shield, requires: { anyOf: ['roles:read'] } },
      { label: 'Users', href: '/administration/users', icon: LockKeyhole, requires: { anyOf: ['users:read'] } },
    ],
  },
  {
    title: 'Workspace',
    items: [{ label: 'Settings', href: '/settings', icon: Settings }],
  },
];
