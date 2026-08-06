---
title: How to Use Neon's Dev / Preview / Production Branches
description: Practical guide to the branch model, when to push schema, and how to avoid the common traps.
date: 2026-08-03
---

# How to Use Neon's Dev / Preview / Production Branches

This is the practical companion to `NEON-BRANCH-WORKFLOW-LOG.md` and the "Persistence layer" section of `ARCHITECTURE.md` — same facts, organized as a walkthrough instead of a status log.

---

## 1. The mental model, in one picture

Think of it less as "one database with three views" and more as **one family tree of databases**, where each branch is a real, independent copy that only shares history with its parent up to the moment it was created:

```
main (Production)
  │
  ├── vercel-dev (Development)          ← created once, lives forever, you control it
  │
  └── preview/feature-x (Preview)       ← created fresh per deployment, then dies
  └── preview/feature-y (Preview)       ← a different one, also fresh, also dies
```

**The critical thing to internalize:** once a branch is created, it is *completely independent*. Running `drizzle-kit push` against `vercel-dev` does absolutely nothing to `main`, and vice versa. There is no syncing, no propagation, no "eventually consistent." If a table exists on `vercel-dev` and not on `main`, it will *stay* that way forever until you explicitly push to `main` too.

This is the single most common source of confusion in this workflow (it's what caused the "0 tables" scare earlier in this project) — always know which branch you're looking at or pushing to.

---

## 2. What each environment actually is

| Environment | Neon branch | Created | Lifespan | `DATABASE_URL` source |
|---|---|---|---|---|
| **Production** | `main` (the project's default branch) | Once, when the Neon project was created | Permanent | Vercel Production env vars |
| **Development** | `vercel-dev` | Once, by the Neon-Vercel integration | Permanent (you manage it like a sandbox) | Vercel Development env vars → your local `.env.local` |
| **Preview** | A new branch per deployment (e.g. `preview/feature-x`) | Automatically, every time you push a feature branch and Vercel builds a preview | Ephemeral — typically deleted when the git branch is deleted | Vercel Preview env vars, **injected per-deployment**, not a stable pull |

Two things worth calling out explicitly:

- **Preview branches clone from `main`, not from `vercel-dev`.** So if you've only pushed schema changes to `vercel-dev`, every new Preview deployment will be missing them — it inherited whatever `main` had at clone time.
- **Your local machine only ever talks to `vercel-dev`**, via `.env.local`. You never locally connect to Production or a Preview branch unless you deliberately pull a different environment's vars (covered below).

---

## 3. How to tell which branch you're looking at

Two places this matters, and both are easy to get wrong:

**In the Neon Console:** there's a branch selector (dropdown, usually top of the page). It's easy to load the console and assume you're looking at "the database" when you're actually pinned to whichever branch you last viewed — often `main` by default. Before running any query or trusting a "table doesn't exist" result, **check the branch selector first.**

**On your machine:** whatever's in `.env.local` right now is `vercel-dev` — unless you've deliberately overwritten it (see §5). If you're not sure, run:
```
findstr DATABASE_URL .env.local
```
and check the hostname — Neon connection strings encode the branch in a way that's usually distinguishable in the Neon Console's Connection Details for each branch (compare the endpoint ID shown there against what's in your file).

---

## 4. Day-to-day workflow (the 90% case)

This is what you'll do for almost all regular feature work:

1. Work locally, `next dev`, using `.env.local` → talks to `vercel-dev`.
2. Change `schema.ts` as needed.
3. Push the change:
   ```
   npx drizzle-kit push
   ```
   This targets whatever `DATABASE_URL` is in `.env.local` — which is `vercel-dev`, so this is safe to run freely without touching Production.
4. Test against `vercel-dev` locally (contract tests, manual testing, whatever) until you're confident.

You do **not** need to think about Production or Preview at all during this loop. That's the point of `vercel-dev` — a permanent sandbox that behaves like the real thing without any risk to live data.

---

## 5. Pushing schema to Production (the step you haven't done yet)

Because `drizzle.config.ts` is hardcoded to read `.env.local`, and `.env.local` always points at `vercel-dev`, you need to temporarily give it Production's connection string instead. Two ways to do this — pick whichever feels safer to you:

**Option A — separate file, override for one command:**
```
vercel env pull .env.production.local --environment=production
```
Then run `drizzle-kit push` with that file's value substituted in for `DATABASE_URL` (either temporarily edit `drizzle.config.ts`'s env path for this one run, or export the variable inline for a single command — e.g. on Windows cmd:)
```
for /f "tokens=2 delims==" %i in ('findstr DATABASE_URL .env.production.local') do set DATABASE_URL=%i
npx drizzle-kit push
```

**Option B — temporarily swap `.env.local`:**
```
vercel env pull .env.production.local --environment=production
copy .env.local .env.local.devbackup
copy .env.production.local .env.local
npx drizzle-kit push
copy .env.local.devbackup .env.local
```
This is more error-prone (easy to forget the final restore step and accidentally start developing against Production), but doesn't require touching `drizzle.config.ts` at all.

**After either option:** switch the Neon Console's branch selector to `main`, and confirm all four tables (`named_filters`, `filter_values`, `filter_history`, `views`) now appear there too.

**⚠️ Don't skip this before deploying.** If deployed code expects these tables and Production doesn't have them yet, every Filters/Views API call in the live app will throw a "relation does not exist" error — this is the current known blocker per `NEON-BRANCH-WORKFLOW-LOG.md`.

---

## 6. Handling a Preview deployment

Because each Preview gets a brand-new branch cloned from `main`, and `main` will (after §5) have the schema — new Previews going forward should inherit it automatically and work out of the box, *as long as Production is kept up to date*.

If you push a **new** schema change while a Preview is already live (or need to test a schema change specifically on a Preview before merging), the manual steps are:

1. Open the specific deployment in the Vercel dashboard.
2. Find that deployment's own `DATABASE_URL` under its Environment Variables (this is per-deployment, not something you can `vercel env pull` generically the way you can for Development).
3. Point `drizzle-kit push` at that value, same override technique as §5.

This is acknowledged as not scaling well manually — per the branch-workflow log, the trigger for automating this (e.g. a Vercel build-command step that runs the push automatically) is when schema changes or Preview usage become frequent enough that this manual step becomes a real bottleneck. Not worth building yet while schema is still actively evolving.

---

## 7. Quick troubleshooting reference

| Symptom | Likely cause | Fix |
|---|---|---|
| Console shows 0 tables | You're looking at the wrong branch in the selector | Switch branch selector, re-check |
| `relation "X" does not exist` on deployed app | Schema was pushed to `vercel-dev`/a Preview branch but not to the branch this deployment actually uses | Push schema to the correct branch (§5 or §6) |
| `vercel env pull` returns blank/missing vars | Propagation delay right after creating vars, or wrong environment flag | Retry after a few minutes; use `--environment=` explicitly |
| `drizzle-kit push` can't find connection info | `.env.local` not loaded by the CLI process | Confirm `dotenv` load in `drizzle.config.ts`, or explicit `--env-file` for standalone scripts |
| New Preview missing recent schema changes | Preview clones from `main`, and `main` doesn't have the change yet | Push to Production first, or manually push to that Preview's branch (§6) |

---

## 8. Two open risks to keep an eye on (not yet confirmed on real Vercel infra)

Both stem from switching `db.ts` to the WebSocket-based driver (`Pool` from `@neondatabase/serverless`), needed for transaction support:

1. **Module-level `Pool` singleton in a serverless environment** — matches Drizzle's own official Neon docs pattern, but at least one other source flags it as risky for connection lifecycle across cold starts. Needs to actually be exercised under real repeated Vercel invocations to know for sure.
2. **`ws` package** — local testing relied on Node 25's native `WebSocket` support and skipped installing `ws`/`bufferutil`, but Drizzle's current docs recommend installing them for Node regardless of version. Vercel's deployed runtime version isn't guaranteed to match your local Node version — watch deployed function logs for `WebSocket is not defined` after the first live Filters/Views usage; if it shows up, install `ws` and `bufferutil` and set `neonConfig.webSocketConstructor = ws` in `db.ts`.

Both will only actually get tested once Production has tables (§5) and something exercises a live save/load.
