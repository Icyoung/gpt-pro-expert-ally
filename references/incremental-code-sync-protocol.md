# Incremental Local Code Sync Protocol

Use this protocol whenever task-relevant local source changes after ChatGPT Pro
received its initial packet or a later update.

## Maintain the Pro-known snapshot

Treat the exact archive bytes sent to Pro as generation `U000`. Persist its
extracted source tree and manifest. After each accepted local update, advance
the generation (`U001`, `U002`, ...) when the attachment is visibly present in
the sent user message. Do not spend a separate Pro turn asking for an
application receipt.

For every generation, retain:

- previous and new source snapshot identifiers;
- selected path scope;
- update ZIP path, size, and SHA-256;
- `incremental.patch`, diffstat, changed paths, and deleted paths;
- the exact follow-up message and visible sent attachment evidence.

Do not use `HEAD` alone as the old snapshot when Pro received dirty or untracked
bytes. Diff against the preserved extracted packet or the last visibly sent
update snapshot.

## Run the sync gate

Before every follow-up that depends on source code:

1. Identify the exact snapshot Pro currently knows.
2. Identify task-relevant local changes since that snapshot.
3. Exclude unrelated user work, runtime state, caches, build output, databases,
   browser state, credentials, and environment files.
4. Compare actual bytes, not only commits or branch names.
5. If no relevant bytes changed, send no source attachment and state no false
   baseline change.
6. If relevant bytes changed, create one numbered update packet.

If local work changed while Pro is actively generating, record the update as
pending. Do not interrupt, stop, reload, or duplicate a healthy run. Attach the
pending update after completion or when Pro explicitly needs input.

## Update packet contract

Prefer:

```bash
python3 scripts/build_incremental_update_bundle.py \
  --base-tree /path/to/exact-pro-known-source \
  --repo /path/to/current-worktree \
  --output /persistent/path/<task>-local-update-u001.zip \
  --brief /path/to/LOCAL_UPDATE_BRIEF.md \
  --update-id U001 \
  --path path/to/relevant/component \
  --path path/to/another/file
```

The ZIP contains:

```text
local-update-packet/
  LOCAL_UPDATE_BRIEF.md
  LOCAL_UPDATE_BASELINE.txt
  incremental.patch
  DIFFSTAT.txt
  CHANGED_PATHS.tsv
  DELETED_PATHS.txt
  current-files/                 # full current bytes for added/modified files
  UPDATE_MANIFEST.sha256
```

Always provide both the patch and current full files:

- the patch explains intent and is easy to review;
- full files remove ambiguity when context drift prevents clean patch
  application;
- `DELETED_PATHS.txt` makes removals explicit;
- `CHANGED_PATHS.tsv` is the authoritative scope list.

The packet builder must refuse unsafe paths, symlinks, unresolved
credential-like content, local repository paths, archive overwrite, or an empty
delta. Persist the ZIP digest beside it.

## Choose delta versus refreshed source packet

Use an incremental packet when the previous Pro-known snapshot is preserved and
the relevant delta is bounded.

Build a fresh sanitized source packet and explicitly reset the Pro-known
baseline when:

- the exact old bytes cannot be reconstructed;
- the path scope changed so broadly that the delta is harder to understand than
  the current source;
- generated or binary changes cannot be represented safely;
- a prior attachment send cannot be verified and its effective state is
  ambiguous;
- manifest verification fails.

Do not resend the original source packet merely because a revision is needed.

## Follow-up message contract

Use a compact message:

```text
Local source update U001 is attached.
Previous Pro-known snapshot: <identifier/hash>
New authoritative local snapshot: <commit plus dirty-state/snapshot identifier>
Relevant reason: <why these local changes affect the task>

Open LOCAL_UPDATE_BRIEF.md. Preserve your existing unreturned work, then apply
or reconcile this delta before continuing. Review incremental.patch, but use
current-files/ as the authoritative current bytes when patch context differs.
Do not send an acknowledgement-only reply; continue the original task using
this update. Only surface a conflict if it prevents safe progress. Do not modify
unrelated paths.
```

Combine this with a revision request when both are needed. Keep validation
failures and local source updates distinct:

- validation evidence says why Pro's delivery failed;
- the update packet says what local source changed independently.

## Avoid an acknowledgement round trip

Do not ask Pro to list applied, skipped, or conflicted paths immediately after
receiving an update. The visible sent attachment is sufficient delivery
evidence. Codex later verifies incorporation by comparing Pro's replacement
output with the authoritative update snapshot and running the acceptance gates.

Pro should mention a conflict only if it cannot reconcile it safely without
discarding newer user changes. Codex then resolves the ownership or product
conflict locally.

## Validation after an update

Each replacement output must still be validated in a new
`codex/gpt-pro/<task-slug>-r<revision>` branch. Read two comparisons:

1. Pro output versus the latest update generation visibly sent to it.
2. Candidate versus the user's current primary worktree.

If the primary worktree advanced again, run the sync gate before the next
source-dependent message. Never overwrite the current primary file wholesale to
resolve drift.
