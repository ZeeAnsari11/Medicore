'use client';

import { useState } from 'react';
import {
  AlertCircle,
  FileText,
  FolderTree,
  Lock,
  MoreVertical,
  Plus,
  Tag,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  cn,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useBranchFieldValue } from '@/hooks/use-branch-field';
import { BranchField } from '@/components/branch-field';
import { useDocumentPdf } from '@/hooks/use-document-pdf';
import { expenseLedgerQuery } from '@/hooks/use-expenses';
import { useExpenseCategories } from '@/hooks/use-expense-categories';
import type { ExpenseCategory } from '@medicore/shared-types';
import { CategoryNameDialog } from '../components/category-name-dialog';
import { ExpenseNav } from '../components/expense-nav';
import { formatAmount } from '../expense-utils';

type DialogState =
  | { type: 'new-main' }
  | { type: 'rename'; category: ExpenseCategory }
  | { type: 'delete'; category: ExpenseCategory }
  | null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function RowMenu({
  category,
  canUpdate,
  canDelete,
  onRename,
  onToggle,
  onDelete,
}: {
  category: ExpenseCategory;
  canUpdate: boolean;
  canDelete: boolean;
  onRename: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  if (!canUpdate && !canDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${category.name}`}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canUpdate && <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>}
        {canUpdate && (
          <DropdownMenuItem onClick={onToggle}>
            {category.isActive ? 'Deactivate' : 'Activate'}
          </DropdownMenuItem>
        )}
        {canUpdate && canDelete && <DropdownMenuSeparator />}
        {canDelete && (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** New main category: it belongs to a branch (the one being viewed, else the main branch), which can be changed here. */
function NewCategoryDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, branchId: string) => Promise<unknown>;
}) {
  const branch = useBranchFieldValue(true, { preselect: true });
  return (
    <CategoryNameDialog
      title="New category"
      description="For example Utility Bills or Salary. It belongs to one branch, and its sub-categories belong to the same branch. Its expenses show as a line on the Profit & Loss."
      label="Category name"
      placeholder="Utility Bills"
      submitLabel="Create"
      onClose={onClose}
      extra={
        <BranchField
          field={branch.field}
          value={branch.value}
          onChange={branch.setValue}
          error={branch.error}
        />
      }
      extraReady={!!branch.value}
      onSubmit={(name) => onCreate(name, branch.value)}
    />
  );
}

export default function ExpenseCategoriesPage() {
  const { has } = usePermissions();
  const branchId = useBranchFilter().branchId;
  const { categories, isLoading, error, create, update, remove, isRemoving } =
    useExpenseCategories(branchId);
  const { openPdf, isOpening } = useDocumentPdf();

  const canCreate = has('acc_expense_categories:create');
  const canUpdate = has('acc_expense_categories:update');
  const canDelete = has('acc_expense_categories:delete');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [newSub, setNewSub] = useState('');
  const [addingSub, setAddingSub] = useState(false);

  const severalBranches = new Set(categories.map((c) => c.branchId)).size > 1;
  const selected = categories.find((c) => c.id === selectedId) ?? categories[0];
  const subs = selected?.subCategories ?? [];

  const addSub = async () => {
    const name = newSub.trim();
    if (!selected || name.length < 2) return;
    setAddingSub(true);
    try {
      await create({ name, parentId: selected.id });
      setNewSub('');
    } catch {
      // The hook already toasted the reason (for example a duplicate name).
    } finally {
      setAddingSub(false);
    }
  };

  /** Expense Sheet of a whole main category, or of one of its sub-categories. */
  const openLedger = (categoryId: string, subCategoryId?: string) =>
    void openPdf(
      `/accounting/expenses/pdf?${expenseLedgerQuery({ branchId, categoryId, subCategoryId })}`,
    );

  const confirmDelete = async (category: ExpenseCategory) => {
    try {
      await remove(category.id);
      if (category.id === selected?.id) setSelectedId(null);
      setDialog(null);
    } catch {
      // Toasted by the hook; keep the dialog open.
    }
  };

  return (
    <PageAccessGuard requires="acc_expenses:read">

      <PageHeader
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        title="Expenses"
        description="Group spending into categories, then break each into sub-categories."
        actions={
          <Button disabled={!canCreate} onClick={() => setDialog({ type: 'new-main' })}>
            <Plus className="mr-2 h-4 w-4" />
            New Category
          </Button>
        }
      />

      <ExpenseNav />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load categories</span>
        </Alert>
      )}

      {isLoading ? (
        <div
          className="grid gap-6 lg:grid-cols-[22rem_1fr]"
          aria-busy="true"
          aria-label="Loading categories"
        >
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Create a category such as Utility Bills or Salary, then add sub-categories like Electricity Bill or Ali Salary."
          action={
            canCreate && (
              <Button onClick={() => setDialog({ type: 'new-main' })}>New Category</Button>
            )
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
          <nav aria-label="Categories" className="space-y-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                aria-current={c.id === selected?.id ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/60',
                  c.id === selected?.id && 'border-primary ring-1 ring-primary',
                  !c.isActive && 'opacity-60',
                )}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FolderTree className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {c.name}
                    {c.isSystem && (
                      <Lock
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-label="Built-in"
                      />
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.subCategories?.length
                      ? `${c.subCategories.length} sub-categor${c.subCategories.length === 1 ? 'y' : 'ies'}`
                      : 'No sub-categories'}
                    {severalBranches && c.branchName ? ` · ${c.branchName}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatAmount(c.totalAmount)}
                  </p>
                  {!c.isActive && <Badge variant="secondary">Inactive</Badge>}
                </div>
              </button>
            ))}
          </nav>

          {selected && (
            <Card>
              <CardContent className="space-y-6 p-6 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      {selected.name}
                      {selected.branchName && (
                        <Badge variant="outline">{selected.branchName}</Badge>
                      )}
                      {selected.isSystem && <Badge variant="outline">Built-in</Badge>}
                      {!selected.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatAmount(selected.totalAmount)} across{' '}
                      {plural(selected.expenseCount, 'expense')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isOpening}
                      onClick={() => openLedger(selected.id)}
                    >
                      <FileText className="mr-1.5 size-4" />
                      Expense Sheet
                    </Button>
                    {!selected.isSystem && (
                      <RowMenu
                        category={selected}
                        canUpdate={canUpdate}
                        canDelete={canDelete}
                        onRename={() => setDialog({ type: 'rename', category: selected })}
                        onToggle={() =>
                          void update({ id: selected.id, isActive: !selected.isActive }).catch(
                            () => undefined,
                          )
                        }
                        onDelete={() => setDialog({ type: 'delete', category: selected })}
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sub-categories
                  </h3>

                  {canCreate && selected.isActive && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void addSub();
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        value={newSub}
                        onChange={(e) => setNewSub(e.target.value)}
                        maxLength={80}
                        placeholder={`Add a sub-category to ${selected.name}, e.g. ${selected.name === 'Salary' ? 'Ali Salary' : 'Electricity Bill'}`}
                        aria-label="New sub-category name"
                      />
                      <Button type="submit" disabled={newSub.trim().length < 2 || addingSub}>
                        <Plus className="mr-1.5 size-4" />
                        Add
                      </Button>
                    </form>
                  )}

                  {subs.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      <Tag className="mx-auto mb-2 size-5" />
                      No sub-categories yet. Expenses can still be recorded straight under{' '}
                      {selected.name}.
                    </div>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {subs.map((s) => (
                        <li
                          key={s.id}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3',
                            !s.isActive && 'opacity-60',
                          )}
                        >
                          <Tag className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {plural(s.expenseCount, 'expense')} · {formatAmount(s.totalAmount)}
                            </p>
                          </div>
                          {!s.isActive && <Badge variant="secondary">Inactive</Badge>}
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isOpening}
                            aria-label={`Expense sheet of ${s.name}`}
                            title={`Expense sheet of ${s.name}`}
                            onClick={() => openLedger(selected.id, s.id)}
                          >
                            <FileText className="size-4" />
                          </Button>
                          <RowMenu
                            category={s}
                            canUpdate={canUpdate && !s.isSystem}
                            canDelete={canDelete && !s.isSystem}
                            onRename={() => setDialog({ type: 'rename', category: s })}
                            onToggle={() =>
                              void update({ id: s.id, isActive: !s.isActive }).catch(
                                () => undefined,
                              )
                            }
                            onDelete={() => setDialog({ type: 'delete', category: s })}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {dialog?.type === 'new-main' && (
        <NewCategoryDialog
          onClose={() => setDialog(null)}
          onCreate={async (name, branchId) => {
            const created = await create({ name, branchId });
            setSelectedId(created.id);
          }}
        />
      )}

      {dialog?.type === 'rename' && (
        <CategoryNameDialog
          title={`Rename ${dialog.category.name}`}
          description={
            dialog.category.parentId ? undefined : 'The Profit & Loss line is renamed with it.'
          }
          label="Name"
          initialName={dialog.category.name}
          rename
          submitLabel="Save"
          onClose={() => setDialog(null)}
          onSubmit={(name) => update({ id: dialog.category.id, name })}
        />
      )}

      {dialog?.type === 'delete' && (
        <Dialog open onOpenChange={(open) => !open && !isRemoving && setDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete {dialog.category.name}?</DialogTitle>
              <DialogDescription>
                {dialog.category.expenseCount > 0
                  ? `${plural(dialog.category.expenseCount, 'expense')} use it, so it can't be deleted. Deactivate it instead to stop using it for new expenses.`
                  : 'This cannot be undone.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)} disabled={isRemoving}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={isRemoving || dialog.category.expenseCount > 0}
                onClick={() => void confirmDelete(dialog.category)}
              >
                {isRemoving ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageAccessGuard>
  );
}
