# Code Delegation Protocol

Use this protocol when ChatGPT Pro receives a repository or code archive.

## Packet contract

The input ZIP should contain:

```text
DELEGATION_BRIEF.md
SOURCE_BASELINE.txt
INPUT_MANIFEST.sha256
<current source tree>
delegation-evidence/        # only task-relevant evidence
```

`SOURCE_BASELINE.txt` records the immutable round-input branch, commit, Git tree,
clean state, archive creation time, selected paths, and exclusions. The archive
SHA-256 is stored beside the ZIP because an archive cannot contain its own
stable digest. In `DELEGATION_BRIEF.md`, point to that sidecar instead of placing
an unresolved or self-referential archive digest in the packet. A normal
repository delegation must not use dirty or untracked source bytes; commit the
exact intended input first.

## Brief contract

Keep the brief concrete and testable:

1. **Mission** — one outcome statement.
2. **Repository baseline** — round-input branch, commit, Git tree, workspace,
   and toolchain.
3. **Observed failure** — raw facts and artifact paths; label hypotheses.
4. **Architecture boundaries** — invariants that must survive.
5. **Implementation scope** — files/components Pro may change.
6. **Allowed operations** — extract, inspect, edit, build, test.
7. **Forbidden operations/claims** — production actions, credential access,
   destructive Git, benchmark shortcuts, unsupported claims.
8. **Required deliverable** — exact archive name and required members.
9. **Required verification** — exact commands/gates and environment disclosures.
10. **Acceptance criteria** — measurable functional, performance, compatibility,
    safety, and recovery requirements.

Do not repeat generic dual-agent prose in every prompt. Keep stable governance in
the skill and put only task-specific facts in the brief.

Send this envelope once, in the first turn of the task conversation. Later
revision turns carry only evidence and the requested delta; do not inject the
template again.

If task-relevant local source changes after the first turn, follow
`git-round-handoff-protocol.md` and `incremental-code-sync-protocol.md`. Keep the
changes on the round's local sibling branch. Normally integrate them into the
next clean round-input commit after Pro returns. Do not mutate the input branch
or paste an unstructured diff.

## Permission envelope

Unless the user grants more, Pro may:

- read and extract the supplied packet;
- modify only its extracted copy;
- run local builds, tests, and benchmarks;
- create the required result archive.

Pro may not:

- access the user's local paths, browser, private repository, credentials, or
  internal environment;
- commit, push, open a PR, deploy, migrate data, modify production, or operate
  real user data;
- remove tests, weaken checks, bypass durability/security, or change workload
  semantics to manufacture success.

## Output contract

Require one downloadable ZIP, normally `<task>-pro-output.zip`, containing:

```text
PRO_REPORT.md
changes.patch
OUTPUT_MANIFEST.sha256
<modified source tree or explicitly agreed changed-file tree>
```

`PRO_REPORT.md` must state:

- root cause and evidence;
- files and behavior changed;
- exact commands run;
- before/after results on identical workload/config/seed;
- failed/skipped checks and why;
- security, correctness, recovery, and compatibility analysis;
- remaining risks and claims not verified.

Reject advice-only answers, partial snippets, missing manifests, or an archive
that cannot be traced to the input baseline.

Require `changes.patch` to apply to the exact round-input commit. After package
verification, Codex imports that patch as one source commit whose direct parent
is the input commit. Archive metadata and reports remain in persistent evidence,
not in the imported source commit unless the task explicitly requires them.

Run `scripts/verify_round_output.py` before importing. It rejects traversal,
duplicates, unsafe links and special files, credential-like files,
high-confidence secrets, CRC or manifest failures, and undeclared members. It
extracts to a new directory and persists the delivery digest and verification
report. Review its binary/executable warnings; warnings are not by themselves a
reason to ask Pro for another long run.

Do not reject an otherwise correct implementation only because its archive also
contains harmless runtime state, caches, generated files, temporary diagnostic
scripts, or working notes. Codex should remove or quarantine those locally and
record the cleanup. Request another long Pro run only when the implementation,
required evidence, security boundary, or acceptance criteria are deficient.

## Composer envelope

Use a short message; the brief carries the detail:

```text
Open DELEGATION_BRIEF.md in the attached source packet and follow it exactly.
Act as the implementation owner: modify the extracted tree, run the required
checks, and return the specified downloadable output ZIP. Do not stop at advice
or snippets. Preserve every listed invariant and distinguish verified results
from environment-limited claims.
```

## Revision envelope

When Codex rejects a delivery, send only evidence needed for correction:

```text
Revision required.
Input branch/commit/tree: <identity>
Rejected output branch/commit: <identity>
Delivery/patch SHA-256: <hashes>
Failing command: <exact command>
Observed output: <minimal relevant log>
Affected file/line: <path:line>
Violated requirement: <exact acceptance/invariant>
Required correction: <smallest complete outcome>
Return a replacement output ZIP with updated report, patch, and manifest.
```

When relevant local code also changed, create the next round-input branch from
the rejected output and reconcile the local sibling commits there. Send the new
clean source packet. Use a numbered update packet only for an unavoidable
mid-round `NEEDS_INPUT` blocker. Keep Pro-caused failures separate from local
source evolution.

Keep the same conversation and task contract. Store each replacement in a new
input/output branch pair under `codex/gpt-pro/<task-slug>/`, so rejected
revisions remain inspectable and the primary worktree stays untouched.
