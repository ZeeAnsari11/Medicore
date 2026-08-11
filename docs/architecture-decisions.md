# Architecture decisions (locked as of the Phase 1 audit)

This records decisions that later phases should treat as settled — not because alternatives
weren't considered, but because reversing them once business modules exist gets expensive. Revisit
only with a real reason, not in passing.

## Tenant isolation

`tenantId` is derived exactly once per request, in `JwtStrategy.validate`
(`apps/api/src/modules/auth/strategies/jwt.strategy.ts`), from the verified JWT payload — never
from a request body, query param, or header. No DTO in the codebase should ever declare a
`tenantId` field; if one does in a future PR, that's a red flag, not a pattern to copy.

Every future tenant-owned service (Product, Vendor, Purchase, …) should extend
`TenantScopedRepository` (`apps/api/src/common/database/tenant-scoped.repository.ts`) instead of
injecting the Mongoose model directly. It forces every query through a `withTenant()` filter, so
forgetting the tenant scope on one query among dozens isn't something a reviewer has to catch by
hand. `TenantsService` and `UsersService` intentionally do **not** extend it — both need
cross-tenant lookups by design (tenant creation, login-by-email).

## Path to database-per-tenant

Single MongoDB database today, `tenantId`-scoped queries via `TenantScopedRepository`. The intended
migration path when a tenant needs true isolation is a **request-scoped connection provider**:
resolve the Mongo connection from `tenantId` (already available on `AuthenticatedUser`) inside a
Nest request-scoped provider, keep `@InjectModel()`-style service code unchanged. This is not built
now — there's no second tenant forcing the decision yet, and request-scoped DI has a real
performance cost that isn't worth paying speculatively. What matters today is that no service
reaches for a raw Mongo client or a module-level singleton connection outside Nest's DI — none do.

## CORS is an explicit allow-list, not a single origin

`CORS_ORIGINS` (`apps/api/src/config/configuration.ts`) is a comma-separated list, checked in
`main.ts`. This was a real bug until this audit: the API only ever allowed `http://localhost:3000`,
which silently broke the desktop app's requests from `http://localhost:1420` (blocked client-side
by the webview, invisible to `curl`-based testing). Every new browser-based client origin
(a deployed web URL, a new desktop dev port, Expo web) must be added here explicitly. Native
mobile requests (iOS/Android, not Expo web) aren't subject to CORS at all — nothing to add there.

## Shared packages must use explicit named exports, never `export *`

`shared-types` and `api-client` compile to CommonJS (so NestJS's plain `require()` keeps working —
see "Path to database-per-tenant" below for why CJS stays). TypeScript compiles `export * from
'./x'` to a dynamic `__exportStar` loop at runtime; the desktop app's production build (`vite
build`, via Rollup) failed with `"createApiClient" is not exported by ".../dist/index.js"` because
Rollup can't statically see through that pattern for a workspace package resolved via a pnpm
symlink. Explicit `export { x } from './x'` compiles to a static `Object.defineProperty` per
export, which Rollup (and every other bundler) can resolve. **Every barrel `index.ts` in a shared
package must use explicit named exports.** This didn't surface in `pnpm typecheck` or `next build`
(Turbopack tolerates it) — only in `vite build` — so it's easy to miss until desktop is actually
built for production. Caught and fixed in this audit; `apps/desktop/vite.config.ts` also had to
widen `build.commonjsOptions.include` to `[/node_modules/, /packages\//]`, since Vite's default
only CJS-interops paths under `node_modules`, and a pnpm workspace symlink resolves outside it.

## Shared API client (`packages/api-client`)

`createApiClient({ baseUrl, tokenStorage })` is the one implementation of fetch + auth header +
error normalization, used by web and desktop today. `TokenStorage` is deliberately async-capable
(`getToken()`/`setToken()` can return a `Promise`) even though web/desktop currently back it with
synchronous `localStorage` — mobile will back it with `expo-secure-store` (async) without the
client needing to change. When mobile grows an auth flow, wire it through this package rather than
writing a third fetch wrapper.

## Offline-sync readiness (applies to future business entities, not Tenant/User)

Tenant and User are server-authoritative — they're never created offline, so Mongo's default
`ObjectId` is fine for them. That does **not** extend to future business entities that desktop/
mobile will eventually create while offline (Sale, Purchase, StockMovement, …). Two conventions to
follow when those modules are built, so offline sync doesn't require a redesign later:

- **Client-generated IDs (UUIDv7 or similar), not server-assigned `ObjectId`**, for any entity an
  offline client can create. A record needs a stable identity the moment it's created locally,
  before it has ever reached the server.
- **Soft deletes** (`deletedAt: Date | null`) instead of hard deletes on syncable entities. A
  client that's been offline for a while needs some way to learn a record was deleted; a hard
  delete is invisible to it.

Neither is implemented yet — there's nothing to apply it to. This is the convention the first
offline-capable module should follow, recorded now so it doesn't have to be rediscovered under
deadline pressure later.

## TypeScript strictness differs by package, on purpose

`shared-types`, `api-client`, `web`, `desktop`, and `mobile` all run in full `strict` mode. The API
does not — it keeps NestJS's default (`strictNullChecks` on, full `strict` off). This was checked,
not overlooked: turning on full `strict` fails only on `strictPropertyInitialization`, exclusively
in class-validator DTOs and Mongoose schema classes, where properties are populated by decorators
at runtime, not the constructor TS can see. Fixing that means `!:` assertions sprinkled across
every DTO/schema field for no real safety gain — the null-safety that actually catches bugs
(`strictNullChecks`) is already on. Not worth the churn; leave it as-is.

## RBAC is enum-based today; permission-based is a future business module, not a rewrite

`@Roles()` + `RolesGuard` check a fixed `TenantRole`/`SystemRole` enum. The domain model's future
"Roles & Permissions" module (tenant-defined custom roles, granular permission strings) doesn't
require replacing this — `RolesGuard` intercepts at the same point either way; swapping an enum
comparison for a permission-set lookup against the resolved user is a change inside the guard, not
a change to how every controller declares its requirements (`@Roles()` stays the call site, or
becomes `@RequirePermission()` with the same shape). No action needed now.
