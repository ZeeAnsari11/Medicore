# Deployment (Vercel + Render + MongoDB Atlas)

## MongoDB Atlas
- Create a free cluster (a replica set; the API needs transactions) and a database user.
- Network Access: Render's free tier has no static IPs, so allow `0.0.0.0/0` and use a strong password.
- Use the `mongodb+srv://` connection string with a database name as `MONGO_URI`.

## API on Render (Web Service)
- Root directory: repo root. Node 20 (`.nvmrc`).
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm turbo run build --filter=@medicore/api...`
- Start command: `node apps/api/dist/main`
- Environment: `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` (the Vercel URL, no trailing slash),
  `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`. Render supplies `PORT`; the API listens on `0.0.0.0`.
- In production the API refuses to start without `MONGO_URI` and a non-default `JWT_SECRET`.
- The free tier sleeps when idle; the SSE stream (`/api/realtime/stream`) reconnects after a wake-up.

## Web on Vercel
- Root Directory: `apps/web`, with "Include source files outside of the Root Directory" enabled.
- Install command: `cd ../.. && pnpm install --frozen-lockfile`
- Build command: `cd ../.. && pnpm turbo run build --filter=@medicore/web...`
- Environment: `NEXT_PUBLIC_API_URL=https://<render-host>/api`. The build fails if it is unset.

The shared packages compile to gitignored `dist/` folders; `turbo run build --filter=<app>...` builds them first.
