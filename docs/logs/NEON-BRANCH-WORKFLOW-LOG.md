---
title: Neon Branch Model & Deploy Workflow
description: Reference log for coordinating schema/deploy work between the NeonDB thread and the app-code thread.
date: 2026-08-03
---

# Neon Branch Model & Deploy Workflow

**Purpose:** shared reference between the NeonDB-tracking thread and this thread (where the actual `views-filters` files live), so schema/branch state doesn't get out of sync across the two conversations.

---

## The branch model

Neon branches are **independent once created** — a schema push to one branch never touches another. Three Vercel environments map to three distinct branch behaviors, not three views of one database:

| Vercel environment | Neon branch behavior |
|---|---|
| **Production** | Connects directly to the Neon project's **default branch** (`main`) |
| **Development** | Connects to a **persistent `vercel-dev` branch** — created once, cloned from `main`, freely modifiable without touching production data. This is what local `.env.local` points at. |
| **Preview** | Each preview deployment gets its **own new, ephemeral branch**, cloned fresh from `main` at deploy time, with a connection string injected per-deployment. Typically auto-deleted when the corresponding git branch is deleted. |

**Key implication:** Preview branches clone from `main` (Production), not from `vercel-dev`. Schema changes pushed only to `vercel-dev` are invisible to new Preview branches until they're also pushed to Production.

---

## Current status (as of 2026-08-03)

- ✅ Neon project (`datamuse-v2`) provisioned, linked to Vercel project `datamuse-v2-2026`
- ✅ Schema (`named_filters`, `filter_values`, `filter_history`, `views`) pushed to `vercel-dev` branch only
- ✅ Full 15/15 contract test suite passing against `vercel-dev` (both FilterStore and ViewStore)
- ✅ `postgres-store.ts` bug fixed: `ViewStore.create()` was silently dropping `createdBy` from the insert (caused the original NOT-NULL failure)
- ✅ `contract-tests.ts` updated: `runViewStoreContractTests` now requires a real `FilterStore` to create a genuine `NamedFilter` first, rather than using a synthetic placeholder id — Postgres's FK constraint on `filter_ref_named_filter_id` correctly rejected the old placeholder (`"some-filter-id"` isn't a valid UUID); the file adapter never caught this since it doesn't enforce referential integrity
- ✅ API routes (`app/api/filters/route.ts`, `.../[id]/route.ts`, `.../[id]/resolve/route.ts`) cut over from `fileFilterStore` to `postgresFilterStore`
- ⬜ **Production branch (`main`) has NO tables yet** — `drizzle-kit push` has only ever been run against whatever `DATABASE_URL` was in `.env.local`, which is `vercel-dev`'s connection string. This is the immediate blocker before any live/Production test will work.
- ⬜ Preview branch — not yet tested at all; will need its own push once a preview deployment exists

## Two unresolved risks flagged, not yet tested against real Vercel infrastructure

Both stem from the `db.ts` driver switch (HTTP driver → WebSocket-based `Pool`, needed for transaction support):

1. **Module-level `Pool` in serverless** — `db.ts` creates the `Pool` once at module scope. At least one current source calls this an anti-pattern for serverless specifically (connection lifecycle across cold starts/invocations), though it's also literally the pattern in Drizzle's own official Neon docs. Unverified either way until exercised on real Vercel infrastructure under repeated invocations.
2. **`ws` package requirement** — the cutover log assumed Node 25's native `WebSocket` support made the `ws`/`neonConfig.webSocketConstructor` workaround unnecessary. But Drizzle's current official docs still explicitly recommend installing `ws` + `bufferutil` for Node.js, with no Node-version carve-out. Local Node version (25) and Vercel's deployed serverless runtime version are not guaranteed to match — this needs confirming against the actual deployed function, not assumed from local behavior.

**Both of these will only surface once Production actually has tables and a live save/load is attempted** — watch Vercel's function logs specifically for `WebSocket`-related errors or connection-pool exhaustion after the schema push below.

---

## Immediate next step: push schema to Production

```bash
vercel env pull .env.production.local --environment=production
# then run drizzle-kit push using that file's DATABASE_URL instead of .env.local's
# (drizzle.config.ts is hardcoded to load .env.local — swap the value in
# temporarily, or override DATABASE_URL for a single command)
npx drizzle-kit push
```

Confirm in the Neon Console (switch branch selector to Production / `main`) that all four tables now appear there too, before testing the live deployed app.

---

## Reference: Dev / Preview / Production workflow going forward

**1. Dev (local):** `next dev` locally, using `.env.local` → `vercel-dev` branch. Run `npx drizzle-kit push` after any `schema.ts` change — pushes straight to `vercel-dev`. This is the iteration sandbox.

**2. Preview:** push a feature branch to GitHub → Vercel auto-creates a preview deployment → Neon integration auto-creates a new branch cloned from `main`. To test Filters/Views on that preview URL, you must pull *that specific deployment's* `DATABASE_URL` (Vercel dashboard → deployment → Environment Variables — per-deployment, not a stable pull) and push the schema to it before testing. **This doesn't scale manually** — every preview is a fresh branch. This is the natural trigger point for migrating to an automated build-time migration step (Vercel build command override running `drizzle-kit push` or a proper migration), once schema changes and preview usage become frequent enough to feel the friction.

**3. Going live:** merge feature branch → `main` → Vercel auto-deploys to Production. The merge itself does **not** push schema — same manual `drizzle-kit push` step, targeted at Production's `DATABASE_URL` specifically, must happen before (ideally) or immediately after the code deploy, to avoid a window where deployed code expects tables that don't exist yet.

**Decision as of this session:** staying manual for now (schema still actively changing, not worth automating yet); revisit automation once schema churn settles down and/or Preview usage becomes frequent enough that manual per-branch pushes get tedious.
