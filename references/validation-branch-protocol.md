# Validation Branch Protocol

Validate the immutable Git round chain described in
`git-round-handoff-protocol.md`.

## Round refs

Each revision keeps:

```text
codex/gpt-pro/<task>/rN-input
codex/gpt-pro/<task>/rN-output
codex/gpt-pro/<task>/rN-local
```

The input and output refs are archival. Do not amend, rebase, squash, delete, or
force-move them. Local work never lands directly on either ref.

## Import the output

1. Preserve and hash the raw download outside the repository.
2. Run `scripts/verify_round_output.py` to safely extract and scan it outside
   every Git worktree. Preserve its verification report.
3. Verify `PRO_REPORT.md`, `changes.patch`, `OUTPUT_MANIFEST.sha256`, and all
   declared source files.
4. Confirm the effective input branch, commit, tree, and sent archive SHA-256.
5. With user commit authorization, prefer `scripts/import_round_output.sh`.
   It creates `rN-output` from the input commit, applies the patch, rejects
   unsafe/runtime paths, creates one import commit, and verifies its parent.
6. Keep reports and raw artifacts outside the source commit.

The output commit must satisfy:

```text
parent(rN-output) == effective-rN-input
worktree(rN-output) == clean
```

Use `scripts/prepare_validation_branch.sh` only for historical deliveries that
predate committed round inputs. Do not use it for a new delegation.

## Read three comparisons

1. **Input → output**

   ```bash
   git diff codex/gpt-pro/<task>/rN-input..codex/gpt-pro/<task>/rN-output
   ```

   This is the exact imported Pro source change.

2. **Output → next input**

   ```bash
   git diff codex/gpt-pro/<task>/rN-output..codex/gpt-pro/<task>/r$((N+1))-input
   ```

   This is accepted local repair, reconciliation, and next-round scope.

3. **Output → current primary bytes**

   Compare the output worktree with the actual current primary worktree,
   including uncommitted task-relevant bytes. This reveals independent product
   drift and integration conflicts.

Never resolve the third comparison by replacing the primary file wholesale.

## Validate

Run repository-required format, lint, type, unit, contract, release build, and
task-specific integration/E2E checks from the output worktree. Record the exact
commands and raw results.

Classify extra files:

- remove or quarantine runtime state, caches, bytecode, logs, generated
  databases, and creator-local manifests;
- keep temporary scripts or notes only when accepted implementation or
  verification depends on them;
- escalate credentials, unknown executable binaries, path traversal, unsafe
  symlinks, dependency/security boundary changes, or source outside scope.

If validation fails, retain the output ref. Start the next input from that
output, integrate accepted local fixes, commit the clean source, and send that
new revision input. Never overwrite or repurpose the rejected round.
