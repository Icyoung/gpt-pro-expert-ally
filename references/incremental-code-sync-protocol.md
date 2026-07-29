# Incremental Local Code Sync Protocol

Use this protocol when task-relevant local code changes after a round input was
sent to ChatGPT Pro. The Git branch chain is authoritative; update packets are
an exceptional transport, not a substitute for committed round inputs.

## Default: queue local work for the next round

After sending `codex/gpt-pro/<task>/rN-input`:

1. Freeze that branch and commit permanently.
2. Create `codex/gpt-pro/<task>/rN-local` from the input commit.
3. Commit task-relevant local fixes on the local branch while Pro runs.
4. Do not interrupt or update a healthy Pro generation.
5. When Pro returns, import its verified patch into `rN-output` whose direct
   parent is the input commit.
6. Create `r(N+1)-input` from `rN-output`, reconcile accepted `rN-local`
   commits, run checks, and commit the exact clean next input.
7. Package and send that new input commit in the same Pro conversation.

The comparisons remain unambiguous:

```text
rN-input..rN-output       = Pro's imported change
rN-output..r(N+1)-input   = local correction and integration
```

## Mid-round update exception

Send code while Pro is still on revision N only when Pro reaches
`NEEDS_INPUT` and cannot safely continue without it. Do not send merely because
local work exists.

For an unavoidable update:

1. Reconcile the required local commits into a new clean immutable branch:
   `codex/gpt-pro/<task>/rN-input-uNNN`.
2. Record its commit and Git tree. Never move the original `rN-input`.
3. Build the delta from the previous effective input commit to this commit.
4. Visibly send one numbered packet and record the new effective input commit.
5. Require the final `rN-output` import commit to use the latest effective input
   commit as its direct parent.

If the effective input changes more than once, increment `uNNN`. Never identify
a dirty worktree or an uncommitted byte snapshot as Pro's authoritative source.

## Update packet

Prefer:

```bash
python3 scripts/build_incremental_update_bundle.py \
  --base-tree /path/to/extracted-previous-input \
  --base-branch codex/gpt-pro/task/rN-input \
  --base-commit <previous-input-commit> \
  --base-git-tree <previous-input-tree> \
  --repo /path/to/clean-rN-input-u001-worktree \
  --output /persistent/task-rN-input-u001.zip \
  --brief /path/to/LOCAL_UPDATE_BRIEF.md \
  --update-id U001 \
  --path path/to/relevant/component
```

The packet contains:

```text
local-update-packet/
  LOCAL_UPDATE_BRIEF.md
  LOCAL_UPDATE_BASELINE.txt
  incremental.patch
  DIFFSTAT.txt
  CHANGED_PATHS.tsv
  DELETED_PATHS.txt
  current-files/
  UPDATE_MANIFEST.sha256
```

Retain the patch for review and the full current bytes for deterministic
reconciliation. The builder must reject unsafe paths, symlinks, credentials,
runtime state, local absolute paths, overwrite, or an empty delta.

The baseline must identify both immutable commits and trees:

- previous effective input branch/commit/tree;
- new effective input branch/commit/tree;
- selected path scope;
- update ZIP path, size, and SHA-256.

## Follow-up message

Use a compact message:

```text
Required source update U001 is attached.
Previous effective input: <branch, commit, tree>
New effective input: <branch, commit, tree>
Reason this blocks continuation: <specific reason>

Open LOCAL_UPDATE_BRIEF.md and reconcile the delta before continuing. Preserve
your unreturned work. Use current-files/ as authoritative if patch context
differs. Do not send an acknowledgement-only reply; continue the original task.
Only surface a conflict if it prevents safe progress.
```

The visible sent attachment is sufficient delivery evidence. Do not spend a
separate Pro turn requesting an application report.

## Validation

Import the replacement only from the latest effective input commit. Verify:

1. output commit parent equals that input commit;
2. input → output diff is exactly the verified Pro patch after recorded local
   cleanup;
3. output → current primary diff reveals independent local drift;
4. output → next input diff contains only accepted local integration.

If the previous effective input cannot be reconstructed or attachment delivery
is ambiguous, stop using an incremental packet. Create a new revision input
branch and send a fresh sanitized source packet instead.
