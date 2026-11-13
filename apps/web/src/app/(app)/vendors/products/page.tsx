'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, Star, Truck, Package } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { EmptyState } from '@/components/layout/empty-state';
import { Card, Input, Button, Checkbox, ComboboxWithCreate, cn } from '@medicore/ui';
import { useVendors } from '@/hooks/use-vendors';
import { useVendorProductsForVendor, useVendorSearchByProduct } from '@/hooks/use-vendor-products';
import { useProducts } from '@/hooks/use-products';
import { usePermissions } from '@/hooks/use-permissions';
import { VendorProductDetailPanel } from './components/vendor-product-detail-panel';
import { ProductDialog } from '../../products/components/product-dialog';
import type { Product } from '@medicore/shared-types';

type ProductDialogMode = 'create' | 'edit' | null;

export default function VendorProductsPage() {
  const searchParams = useSearchParams();
  const { has } = usePermissions();
  const { vendors, isLoading: vendorsLoading } = useVendors();
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    () => searchParams.get('vendorId') ?? null,
  );
  // A vendor only sells products of its own branch.
  const { products } = useProducts({ branchId: vendors.find((v) => v.id === selectedVendorId)?.branchId });
  const [productSearch, setProductSearch] = useState('');
  const [vendorsByProductSearch, setVendorsByProductSearch] = useState('');
  const [debouncedProductTerm, setDebouncedProductTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [linkProductId, setLinkProductId] = useState('');
  const [linkPrice, setLinkPrice] = useState('');
  const [productDialogMode, setProductDialogMode] = useState<ProductDialogMode>(null);

  const { vendorProducts, isLoading: linksLoading, create, update, remove } =
    useVendorProductsForVendor(selectedVendorId);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedProductTerm(vendorsByProductSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [vendorsByProductSearch]);

  const { results: productSearchResults, isLoading: productSearchLoading } = useVendorSearchByProduct(
    debouncedProductTerm,
    showInactive,
  );
  const productSearchActive = debouncedProductTerm.length > 0;
  const filteredSearchResults = useMemo(
    () => productSearchResults.filter((r) => r.company.toLowerCase().includes(vendorSearch.trim().toLowerCase())),
    [productSearchResults, vendorSearch],
  );

  const filteredVendors = useMemo(
    () => vendors.filter((v) => v.company.toLowerCase().includes(vendorSearch.trim().toLowerCase())),
    [vendors, vendorSearch],
  );

  const filteredLinks = useMemo(
    () =>
      vendorProducts
        .filter((vp) => showInactive || vp.isActive)
        .filter((vp) => (vp.product?.name ?? '').toLowerCase().includes(productSearch.trim().toLowerCase())),
    [vendorProducts, productSearch, showInactive],
  );

  const selectedLink = selectedLinkId ? (vendorProducts.find((vp) => vp.id === selectedLinkId) ?? null) : null;
  const selectedProduct = selectedLink ? products.find((p) => p.id === selectedLink.productId) : undefined;
  const selectedVendor = selectedVendorId ? vendors.find((v) => v.id === selectedVendorId) : undefined;

  const handleSelectVendor = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setSelectedLinkId(null);
    setProductSearch('');
  };

  const handleSelectSearchResult = (vendorId: string, firstLinkId: string) => {
    handleSelectVendor(vendorId);
    setSelectedLinkId(firstLinkId);
  };

  const linkedProductIds = new Set(vendorProducts.map((vp) => vp.productId));
  const linkableProducts = products.filter((p) => !linkedProductIds.has(p.id));

  const handleLinkProductPicked = (productId: string) => {
    setLinkProductId(productId);
    setLinkPrice(String(products.find((p) => p.id === productId)?.cp ?? ''));
  };

  const handleLinkExisting = async () => {
    const price = Number(linkPrice);
    if (!selectedVendorId || !linkProductId || linkPrice === '' || Number.isNaN(price) || price < 0) return;
    const link = await create({ vendorId: selectedVendorId, productId: linkProductId, purchasePrice: price });
    setSelectedLinkId(link.id);
    setLinkProductId('');
    setLinkPrice('');
  };

  const handleProductCreated = async (product: Product) => {
    if (!selectedVendorId) return;
    const link = await create({ vendorId: selectedVendorId, productId: product.id, purchasePrice: product.cp });
    setSelectedLinkId(link.id);
  };

  return (
    <PageAccessGuard requires="vendors:read">
      <PageHeader
        title="Vendor Product Pricing"
        description="Browse what each vendor sells, their full product details, and what they currently charge"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_360px] lg:h-[calc(100vh-13rem)]">
        {/* Column 1: Vendors */}
        <Card className="flex flex-col overflow-hidden p-3">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="relative mb-2">
            <Package className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors by product..."
              value={vendorsByProductSearch}
              onChange={(e) => setVendorsByProductSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto">
            {productSearchActive ? (
              productSearchLoading ? (
                <p className="p-2 text-sm text-muted-foreground">Searching...</p>
              ) : filteredSearchResults.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No vendors found for this product</p>
              ) : (
                filteredSearchResults.map((r) => (
                  <button
                    key={r.vendorId}
                    type="button"
                    onClick={() => handleSelectSearchResult(r.vendorId, r.matches[0].linkId)}
                    className={cn(
                      'w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                      selectedVendorId === r.vendorId && 'bg-muted font-medium',
                    )}
                  >
                    <span className="block truncate">{r.company}</span>
                  </button>
                ))
              )
            ) : vendorsLoading ? (
              <p className="p-2 text-sm text-muted-foreground">Loading...</p>
            ) : filteredVendors.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No vendors found.</p>
            ) : (
              filteredVendors.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectVendor(v.id)}
                  className={cn(
                    'w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                    selectedVendorId === v.id && 'bg-muted font-medium',
                  )}
                >
                  {v.company}
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Column 2: Products linked to selected vendor */}
        <Card className="flex flex-col overflow-hidden p-3">
          {!selectedVendorId ? (
            <EmptyState icon={Truck} title="Select a vendor" description="Pick a vendor to see the products they sell." />
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!has('vendors:create') || !has('products:create')}
                  onClick={() => setProductDialogMode('create')}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add product
                </Button>
              </div>

              {has('vendors:create') && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex-1">
                    <ComboboxWithCreate
                      value={linkProductId}
                      onChange={handleLinkProductPicked}
                      options={linkableProducts.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="Link existing product"
                      onCreateNew={() => setProductDialogMode('create')}
                      createLabel={() => 'Create new product'}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Price"
                    value={linkPrice}
                    onChange={(e) => setLinkPrice(e.target.value)}
                    className="h-8 w-24 text-xs"
                  />
                  <Button type="button" size="sm" variant="outline" disabled={!linkProductId} onClick={handleLinkExisting}>
                    Link
                  </Button>
                </div>
              )}

              <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={showInactive} onCheckedChange={(checked) => setShowInactive(checked === true)} />
                Show inactive
              </label>

              <div className="flex-1 space-y-0.5 overflow-y-auto">
                {linksLoading ? (
                  <p className="p-2 text-sm text-muted-foreground">Loading...</p>
                ) : filteredLinks.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title="No products linked"
                    description="This vendor has no linked products yet."
                    className="border-none bg-transparent py-8"
                  />
                ) : (
                  filteredLinks.map((vp) => (
                    <button
                      key={vp.id}
                      type="button"
                      onClick={() => setSelectedLinkId(vp.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                        selectedLinkId === vp.id && 'bg-muted font-medium',
                        !vp.isActive && 'opacity-50',
                      )}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {vp.isPreferred && <Star className="h-3 w-3 shrink-0 fill-current text-primary" />}
                        <span className="truncate">{vp.product?.name ?? vp.productId}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">Rs. {vp.purchasePrice.toFixed(2)}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </Card>

        {/* Column 3: Full product details + vendor-specific details */}
        <Card className="overflow-y-auto p-4">
          {!selectedVendorId ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <>
              {selectedVendor && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Vendor: <span className="font-medium text-foreground">{selectedVendor.company}</span>
                </p>
              )}
              <VendorProductDetailPanel
                link={selectedLink}
                product={selectedProduct}
                update={update}
                remove={remove}
                onEditProduct={() => setProductDialogMode('edit')}
              />
            </>
          )}
        </Card>
      </div>

      <ProductDialog
        open={productDialogMode !== null}
        mode={productDialogMode ?? 'create'}
        product={productDialogMode === 'edit' ? selectedProduct : undefined}
        onOpenChange={(open) => !open && setProductDialogMode(null)}
        onCreated={handleProductCreated}
        defaultVendorId={selectedVendorId ?? undefined}
      />
    </PageAccessGuard>
  );
}
