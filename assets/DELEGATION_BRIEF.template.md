# <Task name>

## Mission

<One concrete outcome. Pro must implement, test, and package it.>

## Repository baseline

- Round input branch: `codex/gpt-pro/<task>/r<N>-input`
- Commit: `<sha>`
- Git tree: `<tree-sha>`
- Input archive SHA-256: see the adjacent `<archive>.sha256` sidecar generated
  after packing; record it in Codex's persistent round evidence
- Clean committed input: `yes`
- Workspace/toolchain: `<root and relevant versions>`

## Observed failure or need

<Facts, measurements, reproduction, and evidence paths. Label hypotheses.>

## Architecture boundaries

- <Invariant that must not change>
- <Durability/security/order/recovery/compatibility boundary>

## Implementation scope

- In scope: `<components and paths>`
- Out of scope: `<components and product directions>`

## Permission envelope

Allowed: extract the supplied packet, inspect/edit its copy, build, test,
benchmark, and create the requested result archive.

Forbidden: credential access, destructive Git, commit/push/PR, deployment,
production activation/config/data, weakened tests, durability/security bypass,
or unsupported production claims.

## Required deliverable

Return `<task>-pro-output.zip` containing:

- the agreed modified source tree;
- `PRO_REPORT.md`;
- `changes.patch` that applies to the exact round-input commit;
- `OUTPUT_MANIFEST.sha256`.

Codex will import the verified patch as one `r<N>-output` commit whose direct
parent is the round-input commit. Do not include `.git` or assume access to the
user's repository.

## Required verification

```text
<exact format/lint/type/unit/contract/build/E2E commands>
```

Report skipped or environment-blocked checks explicitly.

## Acceptance criteria

1. <Functional criterion>
2. <Correctness/security/recovery criterion>
3. <Performance criterion using identical workload/config/seed>
4. <Compatibility or non-regression criterion>
