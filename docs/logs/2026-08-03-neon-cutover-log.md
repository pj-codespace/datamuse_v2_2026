---
title: Neon Backend Cutover — Session Log
description: Step-by-step record of provisioning Neon and connecting it to the app, for context-sharing across threads.
date: 2026-08-03
---

# Neon Backend Cutover — Session Log

**Date:** 2026-08-03
**Scope:** Provisioning a Neon Postgres project, wiring it to Vercel, installing dependencies, pushing the `views-filters` schema, and running the Postgres contract test suite.
**Reference:** Picks up from `NEON-SETUP-CONTEXT.md` — see that file for the original architecture rationale (repository pattern, why Neon/Drizzle, what already existed going in).
**Related thread:** The `views-filters` feature (schema, store interfaces, contract tests) was designed and built in a separate conversation. This session consumed that work; it did not design it.

---

## What was accomplished

### 1. Neon project created
- Created from scratch via the **Neon-Managed Integration** (Neon Console → Integrations → Vercel → Add → Install from Vercel Marketplace).
- Chose Neon-Managed (not Vercel-Managed) specifically to keep billing under the existing Neon account and preserve future flexibility.
- **Neon Auth was left disabled** — auth is explicitly out of scope / not yet designed for this app, per project notes.
- Project details:
  - Neon project: `datamuse-v2`
  - Vercel project: `datamuse-v2-2026` (Vercel scope: `sutirthas-projects-999cc585`)
  - Region: AWS Ohio (`us-east-2`)
  - Postgres version: 18
  - Database name: default (`neondb`)

### 2. Env vars wired through
- Confirmed `DATABASE_URL` and `DATABASE_URL_UNPOOLED` landed in Vercel (Production + Development; Preview is injected dynamically per-deployment, so absent by design).
- Installed Vercel CLI globally (`npm install -g vercel`) — wasn't present locally.
- Ran `vercel link` to connect the local folder to the Vercel project (separate step from the Neon↔Vercel integration link).
- Ran `vercel env pull .env.local` — first pull only returned `VERCEL_OIDC_TOKEN`; a second pull ~26 minutes later returned `DATABASE_URL`/`DATABASE_URL_UNPOOLED` correctly. **Root cause: propagation delay** between the integration writing the vars and them being available to pull — not a config error.
- `.env.local` was auto-added to `.gitignore` by the `vercel env pull` command.

### 3. Dependencies installed
- Hit an npm internal error: `Cannot read properties of null (reading 'matches')` — a known npm/Arborist bug tied to corrupted local `node_modules` state, not project-specific.
- Fixed via clean reinstall: removed `node_modules`, cleared npm cache (no `package-lock.json` existed yet to remove), reinstalled.
- Final installed versions: `@neondatabase/serverless@1.1.0`, `drizzle-kit@0.31.10`, `drizzle-orm@0.45.2`.

### 4. Schema pushed to Neon
- `npx drizzle-kit push` initially failed: `Either connection "url" or "host", "database" are required for PostgreSQL database connection`.
  - **Root cause:** `drizzle-kit` (run via `npx`) doesn't auto-load `.env.local` the way Next.js does.
  - **Fix:** added explicit `dotenv` load (`config({ path: ".env.local" })`) to the top of `drizzle.config.ts`.
- Push succeeded after the fix: `named_filters`, `filter_values`, `filter_history`, `views` tables created.
- **Branch confusion (resolved):** initially checked `main`/production branch in the Neon Console and saw 0 tables. The Neon-Managed integration provisions a separate branch per Vercel environment — the Development `DATABASE_URL` actually points at a `vercel-dev` branch, where the tables were correctly found. Nothing was broken; wrong branch was being viewed.

### 5. Contract tests run against Postgres
- `npx tsx app/_lib/views-filters/run-contract-tests.postgres.ts` initially failed: `DATABASE_URL is not set`.
  - First attempted fix (adding `dotenv` load to the top of the test file) **did not work** — `import` statements are hoisted in ES modules, so `db.ts` (imported transitively via `postgres-store.ts`) ran before the `dotenv` config call executed, regardless of source order.
  - **Actual fix:** used Node's built-in env-file loading at the process level instead: `npx tsx --env-file=.env.local app/_lib/views-filters/run-contract-tests.postgres.ts`.
- Next failure: `No transactions support in neon-http driver`.
  - **Root cause:** `db.ts` was using the HTTP-based Neon client (`drizzle-orm/neon-http` + `neon()`), which has no persistent session and therefore cannot support `db.transaction(...)`.
  - **Fix:** switched `db.ts` to the WebSocket-based driver (`drizzle-orm/neon-serverless` + `Pool` from `@neondatabase/serverless`). Node.js 25's native `WebSocket` support meant the `ws` package / `neonConfig.webSocketConstructor` workaround (needed on Node <22) was not required.
  - **Open architectural note:** this changed the driver for the *entire* shared `db.ts`, not just the test path — worth confirming with the `views-filters` design thread whether `postgres-store.ts` needs transactions elsewhere in normal CRUD, or only in this one code path.
- After the driver switch: **FilterStore contract suite passed fully (9/9 assertions).**
- ViewStore suite failed on the first assertion: `null value in column "created_by" of relation "views" violates not-null constraint`.
  - Not yet diagnosed — unclear whether the contract test fixture omits `createdBy`, or `postgres-store.ts`'s view-creation code drops a supplied `createdBy` before the insert.
  - **Deliberately not patched blindly** — `created_by` looks provenance-related, and audit trails/provenance were called out as an explicit design requirement for this feature, so the fix needs to match original intent rather than just satisfying the constraint.

---

## Current status

- ✅ Neon project provisioned and linked to Vercel
- ✅ Env vars flowing to both Vercel and local dev
- ✅ Dependencies installed
- ✅ Schema pushed, all 4 tables confirmed present (on `vercel-dev` branch)
- ✅ `db.ts` upgraded to a transaction-capable driver
- ✅ FilterStore contract tests: passing (9/9)
- ⏸️ ViewStore contract tests: blocked on `created_by` NOT NULL failure — **handed off to the `views-filters` design thread** for diagnosis, since it likely needs original design intent, not just a schema/code patch
- ⬜ Not yet started: swapping API routes from `fileFilterStore` to `postgresFilterStore`; setting `DATABASE_URL` in Vercel for Preview (if desired); confirming whether `views-filters` feature needs `ws` package for any deploy target other than local Node 25

## Next steps once `created_by` is resolved

1. Re-run the full Postgres contract test suite, confirm all assertions pass (target: parity with the 15 that passed on the file adapter).
2. Swap `app/api/filters/route.ts`, `.../[id]/route.ts`, `.../[id]/resolve/route.ts` from `fileFilterStore` to `postgresFilterStore`.
3. Confirm `DATABASE_URL` in Vercel prod env is genuinely correct/live (not just Development) before treating this as production-ready.
4. Revisit whether `db.ts`'s switch to the WebSocket/`Pool` driver has any implications for serverless connection handling on Vercel (pool lifecycle across invocations) — flagged as an open question, not yet investigated.
