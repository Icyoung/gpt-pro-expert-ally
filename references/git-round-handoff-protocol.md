# Git Round Handoff Protocol

Use this protocol for every repository delegation. Each Pro revision has
immutable input and output branches, and local work during the long Pro run
uses a separate sibling branch.

## Branch contract

For task slug `<task>` and revision `<N>`:

```text
codex/gpt-pro/<task>/r<N>-input
codex/gpt-pro/<task>/r<N>-output
codex/gpt-pro/<task>/r<N>-local
```

The history contract is:

```text
r1-input ---- r1-output ---- r2-input ---- r2-output
    \                              \
     r1-local                       r2-local
```

- `rN-input` points at the exact clean commit packaged and visibly sent to Pro.
  Never move, amend, rebase, or add commits to it after sending.
- `rN-output` is created from the exact `rN-input` commit after the download is
  scanned. Its first and only import commit contains the Pro source delta.
- `rN-local` is created from `rN-input` for Codex or another local agent to work
  while Pro is running. Never validate Pro by applying its archive onto this
  branch.
- `r(N+1)-input` starts from the accepted `rN-output`. Reconcile or cherry-pick
  accepted `rN-local` commits there, resolve conflicts, run required checks, and
  freeze the resulting clean HEAD as the next Pro input.

Creating local branches and commits requires user authorization. One explicit
authorization may cover the complete task-local handoff chain. It never
authorizes push, PR, deployment, production changes, or history rewriting.

## Freeze a round input

1. Start `rN-input` from the previous accepted output commit. For the first
   round, start from the user-approved repository baseline.
2. Integrate only the task-relevant current source. Exclude runtime state,
   caches, build output, databases, credentials, browser state, and unrelated
   user work.
3. Commit the complete intended input and require a clean worktree.
4. Create `DELEGATION_BRIEF.md` with the input branch, commit, Git tree hash,
   scope, tests, and output contract.
5. Prefer:

```bash
scripts/freeze_round_input.sh \
  --repo /path/to/input-worktree \
  --task task-slug \
  --revision 1 \
  --brief /persistent/DELEGATION_BRIEF.md \
  --output /persistent/task-r1-input.zip \
  --path path/to/relevant/source
```

6. Record the input branch, commit, tree hash, ZIP path, size, and SHA-256.
7. Upload only that ZIP. The `.git` directory is never transmitted.

The input ZIP's `SOURCE_BASELINE.txt` is authoritative. It must report a clean
worktree and the same commit/tree as the frozen branch. A dirty branch or a ZIP
built from different bytes is not a valid round input.

## Work locally while Pro runs

Create `rN-local` from `rN-input` in a different worktree. Local agents may
commit fixes there without changing what Pro knows.

Do not send these commits while Pro is actively generating. Queue them for
`r(N+1)-input` unless Pro explicitly reaches `NEEDS_INPUT` and cannot continue
without the update.

For an unavoidable mid-round source update:

1. commit the reconciled source on a new immutable branch named
   `codex/gpt-pro/<task>/r<N>-input-u<NNN>`;
2. build the update packet from the previous sent input commit to that commit;
3. visibly send it and record the new effective input commit;
4. import the final Pro output with that effective input commit as its parent.

Never silently advance or reuse the original `rN-input` ref.

## Import a Pro output

1. Capture Pro's prose and download once. Run
   `scripts/verify_round_output.py --archive <zip> --extract-dir <new-dir>
   --report-dir <new-evidence-dir>` before touching Git.
2. Verify `changes.patch`, `PRO_REPORT.md`, `OUTPUT_MANIFEST.sha256`, and the
   declared source files.
3. Apply the verified patch to a new `rN-output` worktree created from the exact
   effective input commit. Do not copy the full archive blindly over another
   worktree.
4. Remove or exclude only recorded runtime/cache/temporary extras. A source or
   semantic change is not cleanup.
5. With explicit commit authorization, prefer:

```bash
scripts/import_round_output.sh \
  --repo /path/to/repo \
  --task task-slug \
  --revision 1 \
  --input-branch codex/gpt-pro/task-slug/r1-input \
  --worktree /path/to/task-r1-output \
  --patch /persistent/extracted/changes.patch \
  --delivery-sha256 <downloaded-zip-sha256> \
  --report-dir /persistent/validation-r1 \
  --authorize-commit
```

6. Verify that the output commit's direct parent equals the recorded input
   commit and that the worktree is clean.

## Read the timeline

Use these comparisons:

```bash
git diff codex/gpt-pro/<task>/rN-input..codex/gpt-pro/<task>/rN-output
git diff codex/gpt-pro/<task>/rN-output..codex/gpt-pro/<task>/r$((N+1))-input
git log --graph --decorate --oneline --all
```

- input → output is exactly Pro's imported source change;
- output → next input is exactly local correction and integration work;
- candidate → current primary worktree reveals independent product drift.

Do not squash, amend, rebase, delete, or force-move archived round refs. Do not
merge an unvalidated output into the primary branch.
