# Medicore

Medicore is a SaaS platform for medicine/pharmaceutical distribution: manufacturers, vendors,
products, purchases, inventory with batch/lot & expiry tracking, sales, customers, and reporting —
built for multi-tenant use across web, desktop, and mobile.

**Status: Phase 1 — Foundation.** Auth, tenancy, and RBAC are live end-to-end. Business modules
(products, purchases, inventory, sales, etc.) are scaffolded in navigation but not yet implemented;
they roll out incrementally in later phases.

## Architecture

Monorepo managed with **pnpm workspaces** + **Turborepo**.

```
Medicore/
├── apps/
│   ├── api/       NestJS — REST API, MongoDB (Mongoose), JWT auth, tenant + RBAC guards
│   ├── web/       Next.js (App Router) — web admin, Tailwind v4, TanStack Query
│   ├── desktop/   Tauri v2 + React/Vite — macOS & Windows shell
│   └── mobile/    Expo (React Native) — Android & iOS shell
├── packages/
│   ├── shared-types/   Domain types/enums shared by every app (Tenant, User, Role, Auth DTOs)
│   └── api-client/     Platform-agnostic fetch client (auth header, error handling) — used by web & desktop
└── docs/
    ├── domain-model.md            Manufacturer/vendor/product & batch-inventory design
    └── architecture-decisions.md  Locked decisions from the Phase 1 audit — read before building
                                    the first business module
```

**Why these choices:**
- **MongoDB + tenantId** on every tenant-owned document. Tenant context is always derived
  server-side from the authenticated JWT — never trusted from client input. This keeps the door
  open to a future database-per-tenant split without an application rewrite. Future business
  services should extend `TenantScopedRepository` (`apps/api/src/common/database`) rather than
  inject the Mongoose model directly — see `docs/architecture-decisions.md`.
- **`packages/shared-types`** is consumed by every app (API, web, desktop, mobile) so the domain
  model (roles, tenant, user, auth contracts) can't drift between frontend and backend. It compiles
  to real `dist/*.js` + `.d.ts` output — not raw `.ts` — so every consumer (Node, bundlers, Metro)
  resolves it the same way. `packages/api-client` follows the same build pattern and is how web and
  desktop both talk to the API without duplicating fetch/token/error-handling logic.
- **Desktop uses Vite+React, not the Next.js app**, because Tauri wraps a static frontend; reusing
  Next's SSR features inside a Tauri webview isn't a good fit. Desktop and web share the design
  tokens and API contract, not a build pipeline.
- **Mobile uses Expo** (not bare React Native) so `expo start` works without Xcode/Android Studio
  installed — lowers the bar for local development. Native builds remain available later via
  `expo prebuild` when needed.

## Prerequisites

- Node.js ≥ 20 (tested on 22)
- pnpm (via `corepack enable`)
- MongoDB running locally on `27017` (or update `MONGO_URI`)
- Rust + Cargo — only required for desktop (`rustup.rs`)

## Running locally

```bash
pnpm install
pnpm dev
```

This starts the **API** (http://localhost:4000/api) and **web app** (http://localhost:3000)
together — the primary local dev loop. Open http://localhost:3000, click "Create your
organization" to register a tenant + admin user, then sign in.

Other commands:

| Command | What it does |
|---|---|
| `pnpm dev` | Start API + web together (default loop) |
| `pnpm dev:api` | Start only the API |
| `pnpm dev:web` | Start only the web app |
| `pnpm dev:desktop` | Start the Tauri desktop app (compiles Rust on first run — a few minutes) |
| `pnpm dev:mobile` | Start the Expo dev server (scan the QR code, or press `w` for web) |
| `pnpm build` | Build all apps and packages (respects dependency order via Turborepo) |
| `pnpm typecheck` | Type-check every workspace package |
| `pnpm lint` | Lint every workspace package |
| `pnpm format` | Format the repo with Prettier |

## Environment variables

Each app has a `.env.example`. Copy it to `.env` (`.env.local` for Next.js) before first run —
already done for you in this checkout with safe local defaults.

**`apps/api/.env`**
| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | API port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/medicore_dev` | Local MongoDB connection |
| `JWT_SECRET` | dev-only placeholder | **Change before any shared/deployed environment** |
| `JWT_EXPIRES_IN_SECONDS` | `86400` | Access token lifetime |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:1420,http://localhost:8081` | Comma-separated allow-list (web, desktop dev, Expo web) — add every new browser-based client origin here |

**`apps/web/.env.local`**
| Variable | Default |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` |

**`apps/desktop/.env`**
| Variable | Default |
|---|---|
| `VITE_API_URL` | `http://localhost:4000/api` |

Mobile resolves the API host at runtime (`localhost` for iOS simulator/web,
`10.0.2.2` for Android emulator — see `apps/mobile/App.tsx`); adjust for a physical device by
pointing it at your Mac's LAN IP.

## What's implemented (Phase 1)

- Tenant registration (creates a tenant + `TENANT_ADMIN` user) and login, issuing a JWT
- JWT auth guard (global, opt-out via `@Public()`) + RBAC guard (`@Roles()`, tenant + system roles)
- Every tenant-owned Mongo document carries `tenantId`, always derived from the authenticated
  session server-side
- Web: login/register pages, authenticated app shell (sidebar nav, topbar with user menu),
  dashboard with live API/DB status, settings page — all wired to the real API, no mocks
- Desktop and mobile: branded shells that call the same `/api/health` endpoint to confirm
  connectivity — proving the cross-platform architecture before business logic is built on top
- Navigation already lists every planned module (Manufacturers, Vendors, Products, Purchases,
  Inventory, Sales, Customers, Reports) as "coming soon" placeholders, so the full information
  architecture is visible even though the modules aren't built yet

## What's next

Business modules land incrementally, one at a time, each following: data model → backend →
frontend → connect → test → tenant isolation check → UX pass. Manufacturers and Vendors are the
natural next step since Products depend on both.

## Nested entity creation (a standing UX rule for this project)

Whenever a workflow needs a related record that doesn't exist yet (e.g. creating a purchase
invoice and needing a product that isn't in the catalog), the creation UI must open in a modal/
drawer over the current screen — never a full navigation — and the parent workflow's state must
survive untouched. On save, the new record becomes selectable immediately via query cache updates
(TanStack Query `invalidateQueries`/`setQueryData`), never `window.location.reload()`. This isn't
built yet (no workflow needs it in Phase 1), but every form built from here on should follow it.
