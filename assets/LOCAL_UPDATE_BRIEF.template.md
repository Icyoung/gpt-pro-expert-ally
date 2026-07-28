# Local source update `<U001>`

## Snapshot transition

- Previous Pro-known snapshot: `<identifier/hash>`
- New authoritative snapshot: `<commit + dirty state/snapshot identifier>`
- Scope: `<task-relevant paths only>`
- Reason: `<why this local change affects the delegated task>`

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
