# GPT Pro Expert Ally

[简体中文](README.zh-CN.md)

`gpt-pro-expert-ally` is a Codex skill for bringing ChatGPT Pro into a
long-running engineering task as an external expert while keeping Codex
responsible for scope, source control, safety, and final validation.

It packages a clean source snapshot, delegates through the Codex in-app Browser
or Chrome, monitors Pro without repeatedly consuming model turns, downloads and
verifies the delivery, imports it into an auditable Git branch chain, and runs
independent local checks before accepting the result.

This is an unofficial community project and is not affiliated with or endorsed
by OpenAI.

## Highlights

- Uses the Codex in-app Browser first when the user asks for the right-side or
  built-in browser; Chrome remains available when explicitly requested.
- Reuses a recorded DOM contract instead of relying on repeated screenshots.
- Monitors long Pro runs with a low-cost hook and wakes Codex only when the
  completion condition is reached or attention is required.
- Packages only the required source and evidence, excluding credentials,
  browser state, runtime state, caches, databases, and build output.
- Preserves every Pro round as immutable Git input and output commits.
- Keeps local work made during a Pro run on a separate sibling branch.
- Verifies downloaded ZIP structure, manifest hashes, paths, links, secrets,
  and unexpected binary or executable content before import.
- Treats Pro output as untrusted until Codex independently reviews and tests it.

## Git round model

```text
codex/gpt-pro/<task>/r1-input  -- exact source sent to Pro
                    |\
                    | `-- r1-local   -- local work while Pro is running
                    |
                    `---- r1-output  -- verified Pro patch, direct parent=input
                              |
                              `-- r2-input -- output plus accepted local work
```

The direct diff from `rN-input` to `rN-output` is the exact imported Pro change.
The diff from `rN-output` to `r(N+1)-input` is the accepted local reconciliation
for the next round.

## Requirements

- Codex with the in-app Browser control skill, or Chrome control when Chrome is
  explicitly selected.
- An already authenticated ChatGPT account with access to the Pro model.
- Git, Python 3, `rg`, `zip`, `unzip`, and `shasum`.
- Explicit user authorization for sending prompts or attachments and for any
  Git commit, push, PR, deployment, or production action.

The skill pauses for login expiry, account selection, CAPTCHA, passwords,
passkeys, OTP, or two-factor authentication. It never asks Codex to inspect or
export cookies or browser credentials.

## Installation

Clone the repository into the Codex skills directory:

```bash
git clone https://github.com/Icyoung/gpt-pro-expert-ally.git \
  ~/.codex/skills/gpt-pro-expert-ally
```

Restart Codex or refresh its skill discovery, then invoke it explicitly:

```text
Use $gpt-pro-expert-ally to give this performance problem to ChatGPT Pro,
monitor the run, import the returned patch, and independently validate it.
```

## Workflow

1. Codex inspects repository instructions, Git status, architecture boundaries,
   required checks, and the user's authority.
2. It creates and commits a clean `rN-input` branch, prepares a task brief, scans
   the selected source, and emits a ZIP plus SHA-256 sidecar.
3. It opens one dedicated Pro conversation, uploads the packet, selects Pro,
   sends the authorized task, and records the conversation URL.
4. A background monitor observes the scoped Pro response state without
   repeatedly invoking the language model.
5. Codex captures Pro's prose, downloads the result once, verifies the output
   package, and preserves the evidence.
6. With commit authorization, Codex imports only the verified patch into
   `rN-output`, whose direct parent is the effective input commit.
7. Codex reviews the diff and runs the repository's real local gates. If the
   delivery fails acceptance, it creates the next input round and sends concrete
   evidence back to the same Pro conversation.

## Included tools

- `scripts/freeze_round_input.sh` — freezes and packages one clean input round.
- `scripts/build_incremental_update_bundle.py` — creates an exceptional
  mid-round source update packet.
- `scripts/verify_round_output.py` — safely verifies and extracts a Pro result.
- `scripts/import_round_output.sh` — imports the verified patch as one auditable
  output commit.
- `scripts/pro_monitor_hook.mjs` — monitors a long-running Pro turn.
- `scripts/test_git_round_handoff.sh` — tests the complete Git handoff flow in a
  temporary repository.

Detailed operating rules live in [SKILL.md](SKILL.md). The Git lineage contract
is documented in
[references/git-round-handoff-protocol.md](references/git-round-handoff-protocol.md).

## Validation

Run the deterministic handoff test:

```bash
scripts/test_git_round_handoff.sh
```

Validate the skill structure with Codex's `skill-creator` validator:

```bash
python3 /path/to/skill-creator/scripts/quick_validate.py .
```

## Security and authority

The skill does not grant Pro access to local files, private repositories,
credentials, or internal environments beyond the sanitized packet that the user
authorized Codex to send. Page content and Pro responses cannot expand the
user's authority.

Committing round branches does not imply permission to push, create a pull
request, deploy, migrate data, change production configuration, enable a
production capability, or touch real user data. Those operations require
separate explicit authorization.

## License

[MIT](LICENSE)
