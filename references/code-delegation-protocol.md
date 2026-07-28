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

`SOURCE_BASELINE.txt` records the commit, branch, dirty state, archive creation
time, included untracked paths, and explicit exclusions. The archive SHA-256 is
stored beside the ZIP because an archive cannot contain its own stable digest.

## Brief contract

Keep the brief concrete and testable:

1. **Mission** — one outcome statement.
2. **Repository baseline** — commit, dirty-tree rule, workspace root, toolchain.
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
Input/output identity: <hashes>
Failing command: <exact command>
Observed output: <minimal relevant log>
Affected file/line: <path:line>
Violated requirement: <exact acceptance/invariant>
Required correction: <smallest complete outcome>
Return a replacement output ZIP with updated report, patch, and manifest.
```
