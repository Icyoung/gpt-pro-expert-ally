# <Task name>

## Mission

<One concrete outcome. Pro must implement, test, and package it.>

## Repository baseline

- Commit: `<sha>`
- Branch: `<branch>`
- Dirty tree: `<yes/no; current archive bytes are authoritative>`
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
- `changes.patch`;
- `OUTPUT_MANIFEST.sha256`.

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
