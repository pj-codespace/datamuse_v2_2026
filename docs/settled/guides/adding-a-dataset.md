# Adding a new dataset

1. Clean the source data:
   - Strip all derived/computed fields (no x/y, degree, centrality — these are computed at runtime, not stored).
   - Trim whitespace.
   - Drop obvious placeholder/"unknown" nodes — confirm case-by-case, don't auto-drop.
   - Fill blank/missing `strength` on links with `1` (normal).
   - **Do not merge reciprocal links** (A→B and B→A stay as two records) — this is intentional, see DECISIONS.md.
2. Confirm the JSON top-level shape matches `{ project: {...}, nodes: [...], links: [...] }` — `nodes` and `links` must be siblings of `project`, not nested inside it (see the RRCS-in-Africa bug in DECISIONS.md for what this looks like when it's wrong).
3. Make sure `project.settings` — `categories`, `linkTypes` (with `direction`), `linkStrengths`, `influenceLevels`, `interestLevels` — is complete. See `network-sample-empty.json` for the expected shape (it's a template, not valid JSON — placeholders like `<Number>` need real values).
4. Drop the cleaned file in `public/data/`.
5. Add an entry to `PROJECT_REGISTRY` in `app/_lib/data/projects.ts`:
   ```ts
   { id: "your-project-id", dataFile: "your-file.json" }
   ```
6. If a "bug" turns up during this process, verify against the raw data with a script before concluding anything — don't eyeball it.
