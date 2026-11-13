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
        'acc_trial_balance:read',
        'acc_general_ledger:export',
        'acc_payments:create',
        'acc_journal_entries:create',
      ]),
    );
    expect(out).not.toContain('accounting:read');
    expect(out.every((k) => isKnownKey(k))).toBe(true);
  });

  it('has unique keys', () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
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
});
