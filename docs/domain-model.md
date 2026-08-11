# Domain model reference

Design notes for modules not yet built. Read this before implementing Manufacturers, Vendors,
Products, Purchases, Inventory, or Sales, so the data model stays consistent across phases.

## Manufacturer vs. Vendor

Two distinct entities — do not conflate them:

- **Manufacturer**: the company that makes the medicine (e.g. GSK). One manufacturer → many
  products.
- **Vendor / distributor**: the company the tenant buys from. A vendor sells products it doesn't
  manufacture.

A product is never duplicated because multiple vendors sell it. Model it as:

```
Product (belongs to one Manufacturer)
  └── VendorProduct (join: vendorId + productId + vendor-specific price)
```

`Vendor A` and `Vendor B` both reference the same `Panadol 500mg` product, each with their own
`VendorProduct` pricing record.

## Batch-level inventory

Every unit of stock belongs to a batch (lot number + expiry date). A product's "total stock" is a
sum across batches, but the system must always know which batch each unit came from — this is
required for expiry tracking and for regulatory traceability of what was sold from where.

Default allocation strategy is **FEFO** (First Expiry, First Out): a sale consumes the
soonest-to-expire batch first, splitting across batches when one doesn't cover the full quantity.
The architecture should still allow manual batch selection as an override, since real distributors
sometimes need it (e.g. a customer requests a specific batch).

## Multi-tenancy

Single MongoDB database, isolation via `tenantId` on every tenant-owned document (see
`packages/shared-types`'s `TenantOwnedEntity`). `tenantId` is always read from the authenticated
JWT server-side (see `apps/api/src/modules/auth`) — it must never be accepted from client-supplied
request data. This keeps a future move to database-per-tenant a data-migration problem, not an
application rewrite.

## Nested entity creation

See the root `README.md` — "Nested entity creation" section. Applies to every workflow that
references master data (products, vendors, customers, manufacturers) from inside another form.
