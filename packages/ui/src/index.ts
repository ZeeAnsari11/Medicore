// Explicit named exports only — never export * (documented pnpm-symlink + Rollup gotcha)

// Utilities
export { cn } from './lib/cn';
export { useMediaQuery } from './lib/use-media-query';

// Navigation
export { type NavItem, type NavSection, type NavVisibilityRequirement } from './nav/types';
export { can } from './nav/can';
export { LinkContext, useLinkContext, type LinkComponent, LinkProvider } from './nav/link-context';

// Primitives
export { Button, buttonVariants, type ButtonProps } from './primitives/button';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './primitives/card';
export { Input } from './primitives/input';
export { PlaceChip } from './primitives/place-chip';
export { Label } from './primitives/label';
export { Alert, AlertTitle, AlertDescription } from './primitives/alert';
export { CollapsibleSection, type CollapsibleSectionProps } from './primitives/collapsible-section';
export { Badge, badgeVariants, type BadgeProps } from './primitives/badge';
export { Skeleton } from './primitives/skeleton';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './primitives/dropdown-menu';

// Table
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell } from './table/table';
export {
  DataTable,
  type DataTableProps,
  type DataTableServerPagination,
  type DataTableServerSearch,
} from './table/data-table';
export { FilterPanel, type FilterPanelProps } from './table/filter-panel';
export { type ColumnDef } from '@tanstack/react-table';

// Forms
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton } from './forms/select';
export { Checkbox } from './forms/checkbox';
export { Switch } from './forms/switch';
export { ComboboxWithCreate, type ComboboxOption, type ComboboxWithCreateProps } from './forms/combobox';

// Feedback & Layout
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './feedback/dialog';
export { Toaster, toast } from './feedback/toast';
export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from './primitives/popover';
