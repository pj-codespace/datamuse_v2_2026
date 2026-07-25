# Project Docs

Living documentation for the network visualization app. Start here.

## Structure

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — current system architecture: data model, folder structure, how the graph works. The stable, "how it works today" reference.
- **[DECISIONS.md](./DECISIONS.md)** — architecture decision log. Why things are the way they are, especially the non-obvious calls. Append-only; don't rewrite history here, add new entries.
- **[VIEWS-AND-FILTERS.md](./VIEWS-AND-FILTERS.md)** — schema design for Views, Filters, and the audit trail (designed, not yet implemented).
- **[DEV-NOTES.md](./DEV-NOTES.md)** — running scratchpad: in-progress work, open questions, things to pick back up later. Messier than the other docs on purpose.
- **[guides/](./guides/)** — task-oriented how-tos (e.g. "adding a new dataset", "adding a new visualization type").

## Conventions

- **ARCHITECTURE.md** describes what's built and true *now*. When something changes, update it in place.
- **DECISIONS.md** is a log, not a summary — add new entries at the top, don't delete or rewrite old ones even if a decision is later reversed (add a new entry noting the reversal instead).
- **DEV-NOTES.md** is disposable-ish — fine to be informal, prune stale entries whenever.
- Guides go in `guides/` as one file per task, named for what someone is trying to do (`adding-a-dataset.md`, not `dataset-loader-internals.md`).
