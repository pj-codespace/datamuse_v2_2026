---
title: Postgres Backend — Context for Neon Setup
description: Briefing note for a dedicated conversation on provisioning Neon and cutting over from the file-based store.
---

# Postgres Backend — Context for Neon Setup

**Purpose of this note:** enough background for a fresh conversation to hand-hold Neon project creation and the cutover from the file-based store, without needing the full history that produced it.

## What this app is

A Next.js 16 network-visualization tool (D3 force graphs of actor/relationship data — funding flows, influence maps). Full details in `docs/ARCHITECTURE.md` and `docs/project-summary.md` if needed, but not required to help with Neon itself.

## What we're building, and why

The app needs to let people save and reload two things:

- **Named, versioned Filters** — a reusable, labeled set of criteria (categories/link types/influence range/interest range) that can be applied to the graph. Persisted so they survive across sessions, with a full edit history (every criteria change mints a new immutable version rather than overwriting).
- **Views** — a saved combination of a manual node arrangement (layout) and/or an applied Filter, scoped to a specific dataset.

Both are genuinely new persisted entities — nothing to do with the existing static `public/data/*.json` network datasets, which remain read-only fixtures.

## Why Postgres, why Neon specifically

We deliberately designed the persistence layer as a **storage-agnostic repository pattern**: two TypeScript interfaces, `FilterStore` and `ViewStore` (in `app/_lib/views-filters/types.ts`), define every CRUD operation at the domain level. Nothing above that interface knows or cares which database is underneath — that was the whole point, so we could prototype cheaply and swap later without rework.

We started with a **file-based adapter** (`file-store.ts`, JSON files on disk) to validate the schema and CRUD semantics fast. That worked locally, but **broke on Vercel**: Vercel's serverless functions run on a filesystem that's read-only outside `/tmp`, and `/tmp` itself doesn't persist across cold starts or scale-up. So file writes either failed outright or silently vanished — which is exactly the bug that triggered this move to a real database.

**Postgres**, specifically **Neon**, was chosen because:
- Next.js on Vercel runs as ephemeral serverless functions; Neon's HTTP-based driver avoids the persistent-connection problem a traditional Postgres client has in that environment (no connection-pooler setup needed, unlike vanilla Postgres).
- Neon has first-class Vercel integration and instant database branching — useful for preview deployments and for safely running tests without touching real data.
- "Vercel Postgres" as a separate product no longer exists — it was migrated to Neon in 2025, so Neon is effectively the default choice for this stack now, not just one option among several.
- Auth and realtime/live-facilitation features are intentionally **not** being decided yet (see below) — Neon is "just Postgres," which avoids prematurely coupling the database choice to an auth/realtime bundle (e.g. Supabase) before those requirements are even scoped. Switching to Supabase later, if ever wanted, is cheap: both are standard Postgres wire-protocol, so only auth/realtime-specific code would need rework, not the data layer itself.

## ORM: Drizzle

Picked over Prisma because its API stays close to actual SQL (a good match given the user's SQL background, coming from MySQL) rather than introducing a separate schema DSL, and it pairs natively with Neon's HTTP driver with no extra adapter shims — relevant given the serverless-connection concerns above.

## What already exists (built, not yet verified against a real database)

All under `app/_lib/views-filters/`:

- `types.ts` — domain schema (`FilterCriteria`, `FilterValue`, `NamedFilter`, `FilterRef`, `View`) + the `FilterStore`/`ViewStore` interfaces
- `schema.ts` — Drizzle table definitions (`named_filters`, `filter_values`, `filter_history`, `views`)
- `db.ts` — Neon/Drizzle connection singleton, reads `DATABASE_URL` from env
- `postgres-store.ts` — Postgres implementation of `FilterStore`/`ViewStore`
- `contract-tests.ts` — a storage-agnostic behavioral test suite; already run successfully against the file adapter (all 15 assertions passing)
- `run-contract-tests.postgres.ts` — runs that same suite against the Postgres adapter — **not yet executed**, since no Neon project exists yet
- `file-store.ts` — the original file adapter; still functionally correct, just unsuitable for Vercel's production environment
- `run-contract-tests.file.ts` — file-adapter test harness (already passed)

Also: `drizzle.config.ts` at the project root, and API routes under `app/api/filters/` currently wired to the **file** adapter — these will need their imports swapped to `postgres-store.ts` once Neon is verified.

## What's needed from this point (the actual ask for the new conversation)

1. Create a Neon project (account already exists, project not yet created)
2. Get the connection string into `.env.local` as `DATABASE_URL`
3. Install: `npm install drizzle-orm @neondatabase/serverless` and `npm install -D drizzle-kit`
4. Run `npx drizzle-kit push` to create the tables from `schema.ts`
5. Run `npx tsx app/_lib/views-filters/run-contract-tests.postgres.ts` and confirm all assertions pass — ideally against a disposable Neon branch, not the main one, since the suite creates (and leaves behind) test rows
6. Once verified: swap the API routes (`app/api/filters/route.ts`, `.../[id]/route.ts`, `.../[id]/resolve/route.ts`) from importing `fileFilterStore` to `postgresFilterStore`
7. Set `DATABASE_URL` in Vercel's project environment variables so the deployed app can reach Neon too

## Explicitly out of scope for this conversation

- Auth — not yet designed, deferred
- Realtime/live-facilitation — deferred; note the collaboration model is a **facilitation model** (one active editor at a time), not concurrent multi-writer editing, which likely means Supabase-style realtime sync isn't even needed later
- `Views` layout capture (saving manual node arrangements) — blocked on a separate, unrelated piece of work (`NetworkGraph`'s imperative handle needs `getNodePositions`/`setNodePositions` added) — not a Neon/Postgres concern
