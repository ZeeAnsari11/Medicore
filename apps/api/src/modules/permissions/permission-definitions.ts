/**
 * Single source of truth for module-wise access control.
 * Permission keys stay `module:action`. The UI matrix is driven by `GET /permissions/modules`.
 */

export interface ActionDef {
  key: string;
  label: string;
}

export interface ModuleDef {
  key: string;
  label: string;
  group: string;
  /** Sub-modules render indented under their parent (Accounting). */
  parent?: string;
  actions: ActionDef[];
}

const VIEW: ActionDef = { key: 'read', label: 'View' };
const CREATE: ActionDef = { key: 'create', label: 'Create' };
const EDIT: ActionDef = { key: 'update', label: 'Edit' };
const DELETE: ActionDef = { key: 'delete', label: 'Delete' };
const EXPORT: ActionDef = { key: 'export', label: 'Export' };

const ACC = 'Accounting';

export const MODULE_DEFINITIONS: ModuleDef[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview', actions: [VIEW] },
  { key: 'manufacturers', label: 'Manufacturers', group: 'Catalog', actions: [VIEW, CREATE, EDIT] },
  { key: 'vendors', label: 'Vendors', group: 'Catalog', actions: [VIEW, CREATE, EDIT] },
  { key: 'locations', label: 'Cities & Territories', group: 'Catalog', actions: [VIEW, CREATE, EDIT] },
  {
    key: 'products',
    label: 'Products',
    group: 'Catalog',
    actions: [VIEW, CREATE, EDIT, { key: 'edit_prices', label: 'Edit prices' }],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    group: 'Operations',
    actions: [
      VIEW,
      CREATE,
      EDIT,
      { key: 'cancel', label: 'Cancel' },
      { key: 'return', label: 'Return' },
      { key: 'record_payment', label: 'Record payment' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    group: 'Operations',
    actions: [VIEW, { key: 'adjust', label: 'Adjust stock' }],
  },
  {
    key: 'sales',
    label: 'Sales',
    group: 'Operations',
    actions: [
      VIEW,
      CREATE,
      EDIT,
      { key: 'void', label: 'Void' },
      { key: 'return', label: 'Return' },
      { key: 'record_payment', label: 'Record payment' },
      { key: 'discount', label: 'Discount' },
      // Shows the product's TP / CP / RP on the new sale screen; nobody gets it by default.
      { key: 'view_prices', label: 'View TP / CP / RP' },
      // Without view_all a user is an Order Booker: they only see and edit the sales they booked.
      { key: 'view_all', label: 'View all sales' },
      { key: 'book_for_others', label: 'Create sales for other Order Bookers' },
    ],
  },
  // Its own menu: ticking Sales must not hand out the right to confirm or reject pending orders.
  { key: 'process_orders', label: 'Process Orders', group: 'Operations', actions: [VIEW] },
  { key: 'cash_receipt', label: 'Cash Receipt', group: 'Operations', actions: [VIEW, CREATE, EDIT] },
  { key: 'customers', label: 'Customers', group: 'Operations', actions: [VIEW, CREATE, EDIT, DELETE] },
  { key: 'reports', label: 'Reports', group: 'Insights', actions: [VIEW, EXPORT] },
  {
    key: 'ssr',
    label: 'SSR',
    group: 'Insights',
    actions: [VIEW, EXPORT, { key: 'view_cost', label: 'View cost/profit' }],
  },
  { key: 'acc_overview', label: 'Accounting', group: ACC, actions: [VIEW] },
  {
    key: 'acc_chart_of_accounts',
    label: 'Chart of Accounts',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, CREATE, EDIT, DELETE],
  },
  {
    key: 'acc_customer_ledger',
    label: 'Customer Ledger',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, EXPORT],
  },
  {
    key: 'acc_vendor_ledger',
    label: 'Vendor Ledger',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, EXPORT],
  },
  {
    key: 'acc_payments',
    label: 'Payments',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, CREATE, { key: 'void', label: 'Void' }],
  },
  { key: 'acc_expenses', label: 'Expenses', group: ACC, parent: 'acc_overview', actions: [VIEW, CREATE] },
  { key: 'acc_returns', label: 'Returns', group: ACC, parent: 'acc_overview', actions: [VIEW, CREATE] },
  {
    key: 'acc_general_ledger',
    label: 'General Ledger',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, EXPORT],
  },
  {
    key: 'acc_journal_entries',
    label: 'Journal Entries',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, CREATE],
  },
  {
    key: 'acc_trial_balance',
    label: 'Trial Balance',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, EXPORT],
  },
  {
    key: 'acc_profit_loss',
    label: 'Profit & Loss',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, EXPORT],
  },
  {
    key: 'acc_balance_sheet',
    label: 'Balance Sheet',
    group: ACC,
    parent: 'acc_overview',
    actions: [VIEW, EXPORT],
  },
  {
    key: 'users',
    label: 'Users',
    group: 'Users & Settings',
    actions: [VIEW, CREATE, EDIT, { key: 'deactivate', label: 'Deactivate' }, DELETE],
  },
  { key: 'roles', label: 'Roles', group: 'Users & Settings', actions: [VIEW, CREATE, EDIT, DELETE] },
  { key: 'branches', label: 'Branches', group: 'Users & Settings', actions: [VIEW, CREATE, EDIT, DELETE] },
  {
    key: 'permissions',
    label: 'Permission catalog',
    group: 'Users & Settings',
    actions: [VIEW, CREATE, EDIT, DELETE],
  },
];

/** Quick templates that pre-fill the matrix; editable afterwards. */
export const ROLE_TEMPLATES: Array<{ key: string; label: string; permissions: string[] }> = [
  {
    key: 'cashier',
    label: 'Cashier',
    permissions: [
      'dashboard:read',
      'customers:read',
      'customers:create',
      'locations:read',
      'locations:create',
      'products:read',
      'inventory:read',
      'sales:read',
      'sales:create',
      'sales:record_payment',
      'cash_receipt:read',
      'cash_receipt:create',
    ],
  },
  {
    key: 'order_booker',
    label: 'Order Booker',
    permissions: [
      'dashboard:read',
      'customers:read',
      'customers:create',
      'locations:read',
      'locations:create',
      'products:read',
      'inventory:read',
      'sales:read',
      'sales:create',
      'sales:update',
      'sales:record_payment',
      'cash_receipt:read',
      'cash_receipt:create',
    ],
  },
  {
    key: 'store_keeper',
    label: 'Store keeper',
    permissions: [
      'dashboard:read',
      'products:read',
      'vendors:read',
      'manufacturers:read',
      'inventory:read',
      'inventory:adjust',
      'purchases:read',
      'purchases:create',
      'purchases:return',
    ],
  },
  {
    key: 'accountant',
    label: 'Accountant',
    permissions: [
      'dashboard:read',
      'reports:read',
      'reports:export',
      'ssr:read',
      'ssr:export',
      'ssr:view_cost',
      'sales:read',
      'sales:view_all',
      'process_orders:read',
      'purchases:read',
      ...MODULE_DEFINITIONS.filter((m) => m.group === ACC).flatMap((m) =>
        m.actions.map((a) => `${m.key}:${a.key}`),
      ),
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = MODULE_DEFINITIONS.flatMap((m) =>
  m.actions.map((a) => `${m.key}:${a.key}`),
);
const ALL_KEY_SET = new Set(ALL_PERMISSION_KEYS);

export function isKnownKey(key: string): boolean {
  return ALL_KEY_SET.has(key);
}

/**
 * Any action ticked implies `read` (view) on the same module.
 * Without `read`, the other actions of that module are dropped.
 */
export function normalizePermissions(keys: Iterable<string>): string[] {
  const set = new Set(keys);
  const out = new Set<string>();
  for (const def of MODULE_DEFINITIONS) {
    const mine = def.actions.map((a) => `${def.key}:${a.key}`).filter((k) => set.has(k));
    if (mine.length > 0 && def.actions.some((a) => a.key === 'read')) {
      out.add(`${def.key}:read`);
    }
    mine.forEach((k) => out.add(k));
  }
  // Keep custom tenant-defined keys untouched.
  for (const k of set) {
    if (!ALL_KEY_SET.has(k) && !LEGACY_KEYS.has(k)) out.add(k);
  }
  return [...out];
}

/** Keys that predate the module matrix. Roles saved before it (permissionsVersion < 2) are expanded. */
const LEGACY_KEYS = new Set([
  'accounting:read',
  'accounting:create',
  'accounting:update',
  'accounting:post',
  'accounting:delete',
  'purchases:update',
  'purchases:delete',
  'sales:update',
  'sales:delete',
]);

const ACC_SUBS = MODULE_DEFINITIONS.filter((m) => m.group === ACC);

/**
 * Maps a pre-matrix role's keys onto the new vocabulary so nobody loses (or gains) access.
 * Pure and idempotent; applied at resolve time for roles with permissionsVersion < 2.
 */
export function expandLegacyPermissions(keys: string[]): string[] {
  const has = (k: string) => keys.includes(k);
  const out = new Set(keys.filter((k) => !LEGACY_KEYS.has(k)));

  if (keys.some((k) => k.endsWith(':read'))) out.add('dashboard:read');
  if (has('reports:read')) out.add('reports:export');

  if (has('products:update')) out.add('products:edit_prices');

  if (has('purchases:update')) {
    out.add('purchases:update');
    out.add('purchases:return');
    out.add('purchases:record_payment');
  }
  if (has('purchases:delete')) out.add('purchases:cancel');

  if (has('sales:update')) {
    out.add('sales:update');
    out.add('sales:return');
    out.add('sales:record_payment');
    out.add('sales:discount');
  }
  if (has('sales:delete')) out.add('sales:void');
  // Order Booker scoping arrived later: existing sales roles keep seeing every sale.
  if (has('sales:read')) {
    out.add('sales:view_all');
    out.add('sales:book_for_others');
  }

  if (has('accounting:read')) {
    for (const m of ACC_SUBS) {
      out.add(`${m.key}:read`);
      if (m.actions.some((a) => a.key === 'export')) out.add(`${m.key}:export`);
    }
  }
  if (has('accounting:create')) {
    out.add('acc_payments:create');
    out.add('acc_expenses:create');
    out.add('acc_returns:create');
  }
  if (has('accounting:update')) {
    out.add('acc_chart_of_accounts:create');
    out.add('acc_chart_of_accounts:update');
  }
  if (has('accounting:post')) out.add('acc_journal_entries:create');
  if (has('accounting:delete')) out.add('acc_chart_of_accounts:delete');

  return normalizePermissions(out);
}
