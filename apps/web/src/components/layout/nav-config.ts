import {
  ArrowLeftRight,
  Landmark,
  Building,
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
    items: [
      { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, requires: { anyOf: ['dashboard:read'] } },
      { label: 'Dashboard', href: '/accounting', icon: Wallet, requires: { anyOf: ['acc_overview:read'] } },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Sales', href: '/sales', icon: Receipt, requires: { anyOf: ['sales:read'] } },
      { label: 'Process Orders', href: '/sales/process-orders', icon: ClipboardCheck, requires: { anyOf: ['process_orders:read'] } },
      { label: 'Purchases', href: '/purchases', icon: ShoppingCart, requires: { anyOf: ['purchases:read'] } },
      { label: 'Inventory', href: '/inventory', icon: Boxes, requires: { anyOf: ['inventory:read'] } },
      { label: 'Returns', href: '/accounting/returns', icon: RotateCcw, requires: { anyOf: ['acc_returns:read'] } },
      { label: 'Cash Receipt', href: '/sales/cash-receipt', icon: HandCoins, requires: { anyOf: ['cash_receipt:read', 'cash_payment:read'] } },
      { label: 'Cash Receipt Transactions', href: '/sales/cash-receipt-transactions', icon: ListChecks, requires: { anyOf: ['cash_receipt:read', 'cash_payment:read'] } },
    ],
  },
  {
    title: 'Catalog & Masters',
    items: [
      { label: 'Products', href: '/products', icon: Pill, requires: { anyOf: ['products:read'] } },
      { label: 'Manufacturers', href: '/manufacturers', icon: Factory, requires: { anyOf: ['manufacturers:read'] } },
      { label: 'Vendors', href: '/vendors', icon: Truck, requires: { anyOf: ['vendors:read'] } },
      { label: 'Customers', href: '/customers', icon: Users, requires: { anyOf: ['customers:read'] } },
      { label: 'Cities & Territories', href: '/locations', icon: MapPin, requires: { anyOf: ['locations:read'] } },
    ],
  },
  {
    title: 'Reports & Insights',
    items: [
      { label: 'SSR', href: '/reports/ssr', icon: BarChart3, requires: { anyOf: ['ssr:read'] } },
    ],
  },
  {
    title: 'Finance & Accounting',
    items: [
      { label: 'Customer Ledger', href: '/accounting/customer-ledger', icon: Users, requires: { anyOf: ['acc_customer_ledger:read'] } },
      { label: 'Vendor Ledger', href: '/accounting/vendor-ledger', icon: Truck, requires: { anyOf: ['acc_vendor_ledger:read'] } },
      { label: 'Sale Receipts', href: '/accounting/receipts', icon: HandCoins, requires: { anyOf: ['acc_payments:read'] } },
      { label: 'Payments', href: '/accounting/payments', icon: CreditCard, requires: { anyOf: ['acc_payments:read'] } },
      { label: 'General Receipts', href: '/accounting/journal-entries', icon: FileText, requires: { anyOf: ['acc_journal_entries:read'] } },
      { label: 'Expenses', href: '/accounting/expenses', icon: Receipt, requires: { anyOf: ['acc_expenses:read'] } },
      { label: 'Journal Ledger', href: '/accounting/general-ledger', icon: ClipboardList, requires: { anyOf: ['acc_general_ledger:read'] } },
      { label: 'Loans', href: '/accounting/loans', icon: Landmark, requires: { anyOf: ['acc_loans:read'] } },
      { label: 'Fixed Assets', href: '/accounting/assets', icon: Building, requires: { anyOf: ['acc_assets:read'] } },
      { label: 'Profit & Loss', href: '/accounting/profit-loss', icon: LineChart, requires: { anyOf: ['acc_profit_loss:read'] } },
      { label: 'Balance Sheet', href: '/accounting/balance-sheet', icon: Scale, requires: { anyOf: ['acc_balance_sheet:read'] } },
      { label: 'Cash Flow', href: '/accounting/cash-flow', icon: ArrowLeftRight, requires: { anyOf: ['acc_cash_flow:read'] } },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Branches', href: '/administration/branches', icon: Building2, requires: { anyOf: ['branches:read'] } },
      { label: 'Roles', href: '/administration/roles', icon: Shield, requires: { anyOf: ['roles:read'] } },
      { label: 'Users', href: '/administration/users', icon: LockKeyhole, requires: { anyOf: ['users:read'] } },
    ],
  },
  {
    title: 'Workspace',
    items: [{ label: 'Settings', href: '/settings', icon: Settings }],
  },
];
