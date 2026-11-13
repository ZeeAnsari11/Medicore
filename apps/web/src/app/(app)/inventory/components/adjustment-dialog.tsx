'use client';

import { Controller, useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Alert,
  ComboboxWithCreate,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { BranchField } from '@/components/branch-field';
import { useBranchFieldValue } from '@/hooks/use-branch-field';
import { useInventory } from '@/hooks/use-inventory';
import { useProducts } from '@/hooks/use-products';
import { ApiError } from '@/lib/api-client';

interface AdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string | null;
}

interface AdjustmentFormValues {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  operation: 'add' | 'subtract' | 'set';
  quantity: number;
  purchasePrice?: number;
  sellingPrice?: number;
  reason?: string;
}

export function AdjustmentDialog({ open, onOpenChange, branchId }: AdjustmentDialogProps) {
  const { adjust, isAdjusting, adjustError } = useInventory(branchId);
  const branch = useBranchFieldValue(open);
  // Products are per branch: the picker lists the adjustment's own branch.
  const { products } = useProducts({ branchId: branch.value });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<AdjustmentFormValues>({
    defaultValues: { operation: 'add', quantity: 0 },
  });

  const onSubmit = async (values: AdjustmentFormValues) => {
    if (!branch.require()) return;
    await adjust({
      productId: values.productId,
      branchId: branch.value,
      batchNumber: values.batchNumber,
      expiryDate: values.expiryDate,
      operation: values.operation,
      quantity: Number(values.quantity),
      purchasePrice: values.purchasePrice !== undefined ? Number(values.purchasePrice) : undefined,
      sellingPrice: values.sellingPrice !== undefined ? Number(values.sellingPrice) : undefined,
      reason: values.reason,
    });
    onOpenChange(false);
    reset({ operation: 'add', quantity: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
        </DialogHeader>

        {adjustError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{adjustError instanceof ApiError ? adjustError.message : 'An error occurred'}</span>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <BranchField field={branch.field} value={branch.value} onChange={branch.setValue} error={branch.error} />
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Controller
              control={control}
              name="productId"
              rules={{ required: 'Product is required' }}
              render={({ field: { value, onChange } }) => (
                <ComboboxWithCreate
                  value={value}
                  onChange={onChange}
                  options={products.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Select product"
                />
              )}
            />
            {errors.productId && <p className="text-xs text-destructive">{errors.productId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="batchNumber">Batch number</Label>
              <Input
                id="batchNumber"
                aria-invalid={!!errors.batchNumber}
                {...register('batchNumber', { required: 'Required' })}
              />
              {errors.batchNumber && <p className="text-xs text-destructive">{errors.batchNumber.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">Expiry date</Label>
              <Input
                id="expiryDate"
                type="date"
                aria-invalid={!!errors.expiryDate}
                {...register('expiryDate', { required: 'Required' })}
              />
              {errors.expiryDate && <p className="text-xs text-destructive">{errors.expiryDate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="operation">Operation</Label>
              <Controller
                control={control}
                name="operation"
                render={({ field: { value, onChange } }) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger id="operation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Add</SelectItem>
                      <SelectItem value="subtract">Subtract</SelectItem>
                      <SelectItem value="set">Set to</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                aria-invalid={!!errors.quantity}
                {...register('quantity', { required: 'Required', min: { value: 1, message: 'Must be at least 1' } })}
              />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="purchasePrice">Purchase price</Label>
              <Input id="purchasePrice" type="number" step="0.01" placeholder="Optional" {...register('purchasePrice')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sellingPrice">Sale price</Label>
              <Input id="sellingPrice" type="number" step="0.01" placeholder="Optional" {...register('sellingPrice')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" placeholder="Optional — e.g. stock count correction" {...register('reason')} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isAdjusting}>
            {isAdjusting ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
