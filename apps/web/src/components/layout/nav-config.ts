import {
  LayoutDashboard,
  Factory,
  MapPin,
  Truck,
  Pill,
  ShoppingCart,
  Boxes,
  Receipt,
  Users,
  Settings,
  LockKeyhole,
  Shield,
  Building2,
  Wallet,
  CreditCard,
  RotateCcw,
  ClipboardList,
  FileText,
  Scale,
  LineChart,
  HandCoins,
  BarChart3,
  ClipboardCheck,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem, NavSection } from '@medicore/ui';

export const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, requires: { anyOf: ['dashboard:read'] } }],
  },
  {
    title: 'Accounting',
    items: [
      { label: 'Overview', href: '/accounting', icon: Wallet, requires: { anyOf: ['acc_overview:read'] } },
      { label: 'Customer Ledger', href: '/accounting/customer-ledger', icon: Users, requires: { anyOf: ['acc_customer_ledger:read'] } },
      { label: 'Vendor Ledger', href: '/accounting/vendor-ledger', icon: Truck, requires: { anyOf: ['acc_vendor_ledger:read'] } },
      { label: 'Payments', href: '/accounting/payments', icon: CreditCard, requires: { anyOf: ['acc_payments:read'] } },
      { label: 'Expenses', href: '/accounting/expenses', icon: Receipt, requires: { anyOf: ['acc_expenses:read'] } },
      { label: 'Returns', href: '/accounting/returns', icon: RotateCcw, requires: { anyOf: ['acc_returns:read'] } },
      { label: 'General Ledger', href: '/accounting/general-ledger', icon: ClipboardList, requires: { anyOf: ['acc_general_ledger:read'] } },
      { label: 'Journal Entries', href: '/accounting/journal-entries', icon: FileText, requires: { anyOf: ['acc_journal_entries:read'] } },
      { label: 'Profit & Loss', href: '/accounting/profit-loss', icon: LineChart, requires: { anyOf: ['acc_profit_loss:read'] } },
      { label: 'Balance Sheet', href: '/accounting/balance-sheet', icon: Scale, requires: { anyOf: ['acc_balance_sheet:read'] } },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Manufacturers', href: '/manufacturers', icon: Factory, requires: { anyOf: ['manufacturers:read'] } },
      { label: 'Vendors', href: '/vendors', icon: Truck, requires: { anyOf: ['vendors:read'] } },
      { label: 'Products', href: '/products', icon: Pill, requires: { anyOf: ['products:read'] } },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Purchases', href: '/purchases', icon: ShoppingCart, requires: { anyOf: ['purchases:read'] } },
      { label: 'Inventory', href: '/inventory', icon: Boxes, requires: { anyOf: ['inventory:read'] } },
      { label: 'Sales', href: '/sales', icon: Receipt, requires: { anyOf: ['sales:read'] } },
      { label: 'Process Orders', href: '/sales/process-orders', icon: ClipboardCheck, requires: { anyOf: ['process_orders:read'] } },
      { label: 'Cash Receipt', href: '/sales/cash-receipt', icon: HandCoins, requires: { anyOf: ['cash_receipt:read', 'cash_payment:read'] } },
      { label: 'Cash Receipt Transactions', href: '/sales/cash-receipt-transactions', icon: ListChecks, requires: { anyOf: ['cash_receipt:read', 'cash_payment:read'] } },
      { label: 'Customers', href: '/customers', icon: Users, requires: { anyOf: ['customers:read'] } },
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'SSR', href: '/reports/ssr', icon: BarChart3, requires: { anyOf: ['ssr:read'] } },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Branches', href: '/administration/branches', icon: Building2, requires: { anyOf: ['branches:read'] } },
      { label: 'Roles', href: '/administration/roles', icon: Shield, requires: { anyOf: ['roles:read'] } },
      { label: 'Users', href: '/administration/users', icon: LockKeyhole, requires: { anyOf: ['users:read'] } },
      { label: 'Cities & Territories', href: '/locations', icon: MapPin, requires: { anyOf: ['locations:read'] } },
    ],
  },
  {
    title: 'Workspace',
    items: [{ label: 'Settings', href: '/settings', icon: Settings }],
  },
];
