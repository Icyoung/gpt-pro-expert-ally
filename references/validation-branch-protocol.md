# Validation Branch Protocol

Use one immutable candidate branch per downloaded revision:

```text
codex/gpt-pro/<task-slug>-r1
codex/gpt-pro/<task-slug>-r2
...
```

The prefix is always `codex/gpt-pro/`. Keep the task slug stable and increment
the revision only after a replacement Pro delivery.

## Reconstruct the candidate

1. Preserve the raw download and its hash outside the repository.
2. Extract and scan it outside the primary worktree.
3. Start the candidate branch at the recorded input commit.
4. Overlay the exact source bytes sent to Pro. This is necessary when the input
   packet represented a dirty working tree.
5. Verify and apply `changes.patch`.
6. Keep runtime/cache/package-control files out of the candidate source tree.

Prefer:

```bash
scripts/prepare_validation_branch.sh \
  --repo /path/to/repo \
  --baseline <input-commit> \
  --task <task-slug> \
  --revision 1 \
  --worktree /path/to/isolated-worktree \
  --input-tree /path/to/extracted-input-source \
  --patch /path/to/changes.patch \
  --report-dir /path/to/validation-evidence
```

The helper refuses to overwrite an existing branch, worktree, or report
directory.

## Read two different diffs

These diffs answer different questions:

1. **Pro versus sent input** — What did Pro intend to change? Use the delivered
   patch, verify it applies to the authoritative sent bytes, and review every
   changed path.
2. **Candidate versus current primary worktree** — What would integrating the
   candidate change now? This catches local work that continued during the long
   Pro run, including uncommitted changes.

Do not infer the second diff from the baseline commit alone. Compare actual
current bytes. Never resolve conflicts by replacing the current primary file
wholesale.

## Classify extra files

- Remove or quarantine runtime state, caches, bytecode, logs, generated
  databases, and creator-local manifests.
- Treat temporary scripts, notes, and reports as reviewable extras, not an
  automatic rejection.
- Keep an extra file only if the accepted implementation or its required
  verification depends on it.
- Escalate credentials, executable binaries of unknown origin, path traversal,
  symlinks escaping the tree, or security-boundary violations.

Record every local cleanup in the validation report and accepted archive
manifest.
