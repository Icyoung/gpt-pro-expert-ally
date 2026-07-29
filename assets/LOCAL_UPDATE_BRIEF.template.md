# Local source update `<U001>`

## Snapshot transition

- Previous effective input branch: `<codex/gpt-pro/task/rN-input[-uNNN]>`
- Previous commit/tree: `<commit> / <tree>`
- New effective input branch: `<codex/gpt-pro/task/rN-input-uNNN>`
- New commit/tree: `<commit> / <tree>`
- Scope: `<task-relevant paths only>`
- Blocking reason: `<why Pro cannot safely continue without this update>`

## Required reconciliation

1. Preserve your existing unreturned work.
2. Review `incremental.patch` and `DIFFSTAT.txt`.
3. Apply added and modified paths using `current-files/` as the authoritative
   current bytes when patch context differs.
4. Apply every deletion listed in `DELETED_PATHS.txt`.
5. Do not change paths outside `CHANGED_PATHS.tsv` merely to absorb this update.
6. Continue the original task and acceptance contract after reconciliation.

Do not reply merely to acknowledge this update. Continue the original task and
only surface a conflict if it prevents safe progress.
