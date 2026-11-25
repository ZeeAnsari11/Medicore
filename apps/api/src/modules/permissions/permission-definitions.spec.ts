import {
  ALL_PERMISSION_KEYS,
  expandLegacyPermissions,
  isKnownKey,
  MODULE_DEFINITIONS,
  normalizePermissions,
  ROLE_TEMPLATES,
} from './permission-definitions';

describe('permission definitions', () => {
  it('ticking an action implies view; no view drops the module', () => {
    expect(normalizePermissions(['sales:void'])).toEqual(expect.arrayContaining(['sales:read', 'sales:void']));
  });

  it('expands a legacy role so no access is lost', () => {
    const out = expandLegacyPermissions([
      'sales:read',
      'sales:update',
      'sales:delete',
      'purchases:read',
      'purchases:update',
      'accounting:read',
      'accounting:create',
      'accounting:post',
    ]);
    expect(out).toEqual(
      expect.arrayContaining([
        'dashboard:read',
        'sales:return',
        'sales:record_payment',
        'sales:discount',
        'sales:void',
        'purchases:return',
        'purchases:record_payment',
        'acc_general_ledger:export',
        'acc_payments:create',
        'acc_journal_entries:create',
      ]),
    );
    expect(out).not.toContain('accounting:read');
    expect(out.every((k) => isKnownKey(k))).toBe(true);
  });

  it('legacy accounting roles keep managing expense categories, and the accountant template gets them', () => {
    expect(expandLegacyPermissions(['accounting:read', 'accounting:create', 'accounting:update', 'accounting:delete'])).toEqual(
      expect.arrayContaining([
        'acc_expense_categories:read',
        'acc_expense_categories:create',
        'acc_expense_categories:update',
        'acc_expense_categories:delete',
      ]),
    );
    expect(ROLE_TEMPLATES.find((t) => t.key === 'accountant')?.permissions).toContain('acc_expense_categories:create');
  });

  it('has unique keys', () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });
});

describe('view_prices permission', () => {
  it('is a known sales action and is not in any role template by default', () => {
    expect(isKnownKey('sales:view_prices')).toBe(true);
    for (const t of ROLE_TEMPLATES) expect(t.permissions).not.toContain('sales:view_prices');
  });
});

describe('order booker permissions', () => {
  it('defines view_all and book_for_others on sales, and an order_booker template without view_all', () => {
    expect(isKnownKey('sales:view_all')).toBe(true);
    expect(isKnownKey('sales:book_for_others')).toBe(true);
    const tpl = ROLE_TEMPLATES.find((t) => t.key === 'order_booker');
    expect(tpl?.permissions).toContain('sales:create');
    expect(tpl?.permissions).not.toContain('sales:view_all');
    expect(ROLE_TEMPLATES.find((t) => t.key === 'accountant')?.permissions).toContain('sales:view_all');
  });

  it('keeps legacy roles seeing every sale', () => {
    expect(expandLegacyPermissions(['sales:read'])).toEqual(
      expect.arrayContaining(['sales:view_all', 'sales:book_for_others']),
    );
  });

  it('skip_process_order is its own menu, not an action of Sales, and legacy roles do not get it', () => {
    expect(isKnownKey('skip_process_order:read')).toBe(true);
    expect(MODULE_DEFINITIONS.find((m) => m.key === 'sales')?.actions.map((a) => a.key)).not.toContain('skip_process_order');
    expect(expandLegacyPermissions(['sales:read'])).not.toContain('skip_process_order:read');
  });

  it('ticking view_all implies view', () => {
    expect(normalizePermissions(['sales:view_all'])).toEqual(expect.arrayContaining(['sales:read', 'sales:view_all']));
  });

  it('lets the accountant process pending orders but not the order booker', () => {
    expect(isKnownKey('process_orders:read')).toBe(true);
    expect(ROLE_TEMPLATES.find((t) => t.key === 'accountant')?.permissions).toContain('process_orders:read');
    expect(ROLE_TEMPLATES.find((t) => t.key === 'order_booker')?.permissions).not.toContain('process_orders:read');
  });

  it('is its own menu, so ticking every Sales action does not grant it', () => {
    const sales = MODULE_DEFINITIONS.find((m) => m.key === 'sales')!;
    const everySalesAction = sales.actions.map((a) => `sales:${a.key}`);
    expect(normalizePermissions(everySalesAction)).not.toContain('process_orders:read');
    expect(sales.actions.map((a) => a.key)).not.toContain('process_orders');
  });

  it('does not hand process_orders to legacy roles', () => {
    expect(expandLegacyPermissions(['sales:read'])).not.toContain('process_orders:read');
  });

  it('editing a saved cash-receipt transaction is its own permission, not given to the receipt-entry roles', () => {
    expect(isKnownKey('cash_receipt:update')).toBe(true);
    for (const key of ['order_booker', 'cashier']) {
      const permissions = ROLE_TEMPLATES.find((t) => t.key === key)?.permissions ?? [];
      expect(permissions).not.toContain('cash_receipt:update');
    }
    expect(normalizePermissions(['cash_receipt:create'])).not.toContain('cash_receipt:update');
  });
});
