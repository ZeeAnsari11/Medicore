import { auth, bootstrap, TenantCtx, TestEnv } from './helpers/bootstrap';

let env: TestEnv;
const api = () => env.api();

const post = (t: TenantCtx, path: string, body: object) =>
  api().post(`/api/${path}`).set(auth(t)).send(body);
const get = (t: TenantCtx, path: string) => api().get(`/api/${path}`).set(auth(t));
const patch = (t: TenantCtx, path: string, body: object) =>
  api().patch(`/api/${path}`).set(auth(t)).send(body);
const del = (t: TenantCtx, path: string) => api().delete(`/api/${path}`).set(auth(t));

async function ok(res: Promise<any>, status = 201) {
  const r = await res;
  if (r.status !== status)
    throw new Error(
      `${r.request.method} ${r.request.url} -> ${r.status} ${JSON.stringify(r.body)}`,
    );
  return r.body;
}

describe('Expense categories (e2e)', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  let branchId: string;
  let cashAccountId: string;
  let utility: any;
  let electricity: any;
  let salary: any;

  const expense = (extra: object) =>
    post(A, 'accounting/expenses', {
      branchId,
      amount: 100,
      paymentMethod: 'CASH',
      paymentAccountId: cashAccountId,
      description: 'test',
      ...extra,
    });

  beforeAll(async () => {
    env = await bootstrap();
    A = env.A;
    B = env.B;
    branchId = (await ok(post(A, 'branches', { name: 'Main', code: 'MAIN' }))).id;
    A.branchId = branchId;
    const accounts = await ok(get(A, 'accounting/accounts'), 200);
    cashAccountId = accounts.find((a: any) => a.systemKey === 'CASH').id;
  });

  afterAll(async () => {
    await env?.close();
  });

  it('turns the existing expense accounts into main categories', async () => {
    const list = await ok(get(A, 'accounting/expense-categories'), 200);
    const names = list.map((c: any) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['Operating Expenses', 'Bank Charges', 'Other Expenses']),
    );
    expect(names).not.toContain('Cost of Goods Sold');
    expect(list.every((c: any) => c.parentId === null && Array.isArray(c.subCategories))).toBe(
      true,
    );
  });

  it('creates a main category with its own expense account, and sub-categories under it', async () => {
    utility = await ok(
      post(A, 'accounting/expense-categories', { name: 'Utility Bills', branchId }),
    );
    electricity = await ok(
      post(A, 'accounting/expense-categories', { name: 'Electricity Bill', parentId: utility.id }),
    );
    await ok(post(A, 'accounting/expense-categories', { name: 'Gas Bill', parentId: utility.id }));
    salary = await ok(post(A, 'accounting/expense-categories', { name: 'Salary', branchId }));
    await ok(post(A, 'accounting/expense-categories', { name: 'Ali Salary', parentId: salary.id }));

    const accounts = await ok(get(A, 'accounting/accounts'), 200);
    expect(accounts.find((a: any) => a.id === utility.accountId)).toMatchObject({
      name: 'Utility Bills',
      type: 'EXPENSE',
      isActive: true,
    });

    const list = await ok(get(A, 'accounting/expense-categories'), 200);
    const main = list.find((c: any) => c.id === utility.id);
    expect(main.subCategories.map((s: any) => s.name)).toEqual(['Electricity Bill', 'Gas Bill']);
  });

  it('rejects duplicate names, sub-categories of sub-categories and unknown parents', async () => {
    await ok(post(A, 'accounting/expense-categories', { name: 'utility bills', branchId }), 409);
    await ok(post(A, 'accounting/expense-categories', { name: 'No Branch' }), 400); // a main category needs a branch
    await ok(
      post(A, 'accounting/expense-categories', { name: 'gas bill', parentId: utility.id }),
      409,
    );
    await ok(
      post(A, 'accounting/expense-categories', { name: 'Nested', parentId: electricity.id }),
      400,
    );
    await ok(post(A, 'accounting/expense-categories', { name: 'Orphan', parentId: 'nope' }), 404);
  });

  it('records an expense by category: posts to the main account and returns the names', async () => {
    const e = await ok(
      expense({ categoryId: utility.id, subCategoryId: electricity.id, amount: 250 }),
    );
    expect(e).toMatchObject({
      expenseAccountId: utility.accountId,
      categoryId: utility.id,
      categoryName: 'Utility Bills',
      subCategoryName: 'Electricity Bill',
      paymentAccountName: 'Cash',
    });
    const list = await ok(get(A, 'accounting/expense-categories'), 200);
    expect(list.find((c: any) => c.id === utility.id)).toMatchObject({
      expenseCount: 1,
      totalAmount: 250,
    });
  });

  it("still accepts the old expenseAccountId-only request and files it under that account's main category", async () => {
    const e = await ok(expense({ expenseAccountId: utility.accountId }));
    expect(e).toMatchObject({ categoryId: utility.id, categoryName: 'Utility Bills' });
  });

  it('rejects a sub-category of another category, and a request with no category at all', async () => {
    await ok(expense({ categoryId: salary.id, subCategoryId: electricity.id }), 400);
    await ok(expense({}), 400);
  });

  it('only accepts active expense accounts', async () => {
    await ok(expense({ expenseAccountId: cashAccountId }), 400);
  });

  it('renames a main category together with its account, so the P&L line follows', async () => {
    await ok(patch(A, `accounting/expense-categories/${salary.id}`, { name: 'Staff Salary' }), 200);
    const accounts = await ok(get(A, 'accounting/accounts'), 200);
    expect(accounts.find((a: any) => a.id === salary.accountId).name).toBe('Staff Salary');
  });

  it('protects built-in categories', async () => {
    const list = await ok(get(A, 'accounting/expense-categories'), 200);
    const builtIn = list.find((c: any) => c.name === 'Operating Expenses');
    expect(builtIn.isSystem).toBe(true);
    await ok(patch(A, `accounting/expense-categories/${builtIn.id}`, { name: 'Ops' }), 400);
    await ok(del(A, `accounting/expense-categories/${builtIn.id}`), 400);
  });

  it('will not delete a category that has expenses or sub-categories, but deletes an unused one', async () => {
    await ok(del(A, `accounting/expense-categories/${utility.id}`), 409); // has sub-categories
    await ok(del(A, `accounting/expense-categories/${electricity.id}`), 409); // used by an expense
    const gas = (await ok(get(A, 'accounting/expense-categories'), 200))
      .find((c: any) => c.id === utility.id)
      .subCategories.find((s: any) => s.name === 'Gas Bill');
    await ok(del(A, `accounting/expense-categories/${gas.id}`), 204);
  });

  it('serves the Expense Sheet PDF for the page filters, and rejects bad filters', async () => {
    const pdf = (query: string) => api().get(`/api/accounting/expenses/pdf${query}`).set(auth(A));
    const all = await pdf('');
    expect(all.status).toBe(200);
    expect(all.headers['content-type']).toContain('application/pdf');
    const bySub = await pdf(
      `?categoryId=${utility.id}&subCategoryId=${electricity.id}&from=2020-01-01&to=2999-12-31&paymentMethod=CASH`,
    );
    expect(bySub.status).toBe(200);
    expect(bySub.headers['content-disposition']).toContain('expense-sheet-electricity-bill.pdf');
    expect((await pdf(`?categoryId=${salary.id}&subCategoryId=${electricity.id}`)).status).toBe(
      400,
    ); // sub of another category
    expect((await pdf('?categoryId=nope')).status).toBe(404);
    expect((await pdf('?from=2026-12-01&to=2026-11-01')).status).toBe(400);
    expect((await pdf('?paymentMethod=BITCOIN')).status).toBe(400);
  });

  describe('categories belong to a branch', () => {
    let lahore: string;
    let lahoreUtility: any;
    let lahoreSub: any;
    let mainSpend: number;

    beforeAll(async () => {
      lahore = (await ok(post(A, 'branches', { name: 'Lahore', code: 'LHR' }))).id;
      mainSpend = (
        await ok(get(A, `accounting/expense-categories?branchId=${branchId}`), 200)
      ).find((c: any) => c.id === utility.id).totalAmount;
    });

    it("lists each branch's own categories, with the built-in ones in every branch", async () => {
      const inLahore = await ok(get(A, `accounting/expense-categories?branchId=${lahore}`), 200);
      const names = inLahore.map((c: any) => c.name);
      expect(names).toEqual(
        expect.arrayContaining(['Operating Expenses', 'Bank Charges', 'Other Expenses']),
      );
      expect(names).not.toContain('Utility Bills'); // made in the other branch
      expect(inLahore.every((c: any) => c.branchId === lahore)).toBe(true);
    });

    it('allows the same name in another branch, sharing the account so the Profit & Loss keeps one line', async () => {
      lahoreUtility = await ok(
        post(A, 'accounting/expense-categories', { name: 'Utility Bills', branchId: lahore }),
      );
      expect(lahoreUtility.branchId).toBe(lahore);
      expect(lahoreUtility.accountId).toBe(utility.accountId);
    });

    it("gives a sub-category its category's branch", async () => {
      lahoreSub = await ok(
        post(A, 'accounting/expense-categories', {
          name: 'zeeshan',
          parentId: lahoreUtility.id,
          branchId,
        }),
      );
      expect(lahoreSub.branchId).toBe(lahore); // the branch sent is ignored for a sub-category
    });

    it('only accepts a category in the branch the expense is recorded in', async () => {
      await ok(expense({ categoryId: lahoreUtility.id, subCategoryId: lahoreSub.id }), 400); // recorded in Main
      const e = await ok(
        post(A, 'accounting/expenses', {
          branchId: lahore,
          categoryId: lahoreUtility.id,
          subCategoryId: lahoreSub.id,
          amount: 70,
          paymentMethod: 'CASH',
          paymentAccountId: cashAccountId,
          description: 'lhr',
        }),
      );
      expect(e.categoryName).toBe('Utility Bills');
    });

    it('counts spend per branch even though the account is shared', async () => {
      const inLahore = await ok(get(A, `accounting/expense-categories?branchId=${lahore}`), 200);
      expect(inLahore.find((c: any) => c.id === lahoreUtility.id)).toMatchObject({
        expenseCount: 1,
        totalAmount: 70,
      });
      const inMain = await ok(get(A, `accounting/expense-categories?branchId=${branchId}`), 200);
      expect(inMain.find((c: any) => c.id === utility.id).totalAmount).toBe(mainSpend); // Lahore's 70 is not in Main's
    });

    it("renaming one branch's category leaves the other's, and keeps its own spend", async () => {
      await ok(
        patch(A, `accounting/expense-categories/${lahoreUtility.id}`, { name: 'Bills' }),
        200,
      );
      const inLahore = await ok(get(A, `accounting/expense-categories?branchId=${lahore}`), 200);
      expect(inLahore.find((c: any) => c.id === lahoreUtility.id)).toMatchObject({
        name: 'Bills',
        totalAmount: 70,
      });
      const inMain = await ok(get(A, `accounting/expense-categories?branchId=${branchId}`), 200);
      expect(inMain.find((c: any) => c.id === utility.id).name).toBe('Utility Bills');
    });
  });

  describe('the default Difference category', () => {
    it('every branch has Difference with a Sales Difference sub-category, including a branch added later', async () => {
      const lahore = (await ok(get(A, 'branches'), 200)).find((b: any) => b.code === 'LHR').id;
      const mainCats = await ok(get(A, `accounting/expense-categories?branchId=${branchId}`), 200);
      const lahoreCats = await ok(get(A, `accounting/expense-categories?branchId=${lahore}`), 200);
      for (const [cats, id] of [
        [mainCats, branchId],
        [lahoreCats, lahore],
      ] as const) {
        const difference = cats.find((c: any) => c.name === 'Difference');
        expect(difference).toMatchObject({ branchId: id, isSystem: true });
        expect(difference.subCategories.map((s: any) => s.name)).toContain('Sales Difference');
      }
      // One shared account, so the Profit & Loss has one Difference line.
      const accounts = await ok(get(A, 'accounting/accounts'), 200);
      expect(accounts.filter((a: any) => a.name === 'Difference')).toHaveLength(1);
    });

    it('cannot be renamed, deactivated or deleted, but takes more sub-categories', async () => {
      const difference = (
        await ok(get(A, `accounting/expense-categories?branchId=${branchId}`), 200)
      ).find((c: any) => c.name === 'Difference');
      const salesDifference = difference.subCategories.find(
        (s: any) => s.name === 'Sales Difference',
      );
      await ok(patch(A, `accounting/expense-categories/${difference.id}`, { name: 'Other' }), 400);
      await ok(
        patch(A, `accounting/expense-categories/${salesDifference.id}`, { isActive: false }),
        400,
      );
      await ok(del(A, `accounting/expense-categories/${salesDifference.id}`), 400);
      await ok(del(A, `accounting/expense-categories/${difference.id}`), 400);
      await ok(
        post(A, 'accounting/expense-categories', { name: 'Cash Short', parentId: difference.id }),
      );
    });

    it('an expense needs an Exp Sub Category', async () => {
      const difference = (
        await ok(get(A, `accounting/expense-categories?branchId=${branchId}`), 200)
      ).find((c: any) => c.name === 'Difference');
      await ok(expense({ categoryId: difference.id }), 400);
      const e = await ok(
        expense({ categoryId: difference.id, subCategoryId: difference.subCategories[0].id }),
      );
      expect(e.categoryName).toBe('Difference');
    });
  });

  it('numbers expenses 1, 2, 3 within each tenant, and another tenant starts again at 1', async () => {
    const mine = await ok(get(A, 'accounting/expenses'), 200);
    const numbers = mine.map((e: any) => e.expenseNumber).sort((a: number, b: number) => a - b);
    expect(numbers[0]).toBe(1);
    expect(numbers).toEqual(numbers.map((_: number, i: number) => i + 1)); // no gaps, no repeats

    const branchB = (await ok(post(B, 'branches', { name: 'Main', code: 'MAIN' }))).id;
    B.branchId = branchB;
    const accountsB = await ok(get(B, 'accounting/accounts'), 200);
    const first = await ok(
      post(B, 'accounting/expenses', {
        branchId: branchB,
        expenseAccountId: accountsB.find((a: any) => a.systemKey === 'OPERATING_EXPENSES').id,
        amount: 5,
        paymentMethod: 'CASH',
        paymentAccountId: accountsB.find((a: any) => a.systemKey === 'CASH').id,
        description: 'first in tenant B',
      }),
    );
    expect(first.expenseNumber).toBe(1);
  });

  it('keeps tenants apart', async () => {
    const other = await ok(get(B, 'accounting/expense-categories'), 200);
    expect(other.map((c: any) => c.name)).not.toContain('Utility Bills');
    await ok(patch(B, `accounting/expense-categories/${utility.id}`, { name: 'Hijacked' }), 404);
    await ok(del(B, `accounting/expense-categories/${utility.id}`), 404);
  });
});
