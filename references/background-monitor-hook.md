# Background Monitor Hook

Use the host-side monitor only while Codex has no other tool work to perform.
It reduces monitoring token use by polling the compact browser state inside one
still-pending tool call. The tool call returns to the model only after the
current Pro turn completes. Explicit blockers and tab failures are the only
early exceptions.

## Contract

- Poll compact state every 5 seconds inside the host cell. Each poll is a
  bounded DOM read and does not capture or return a screenshot.
- Observe the visible Stop control at least once after sending. While it is
  present, absorb every semantic or fingerprint change internally.
- Complete after the Stop control is absent for the configured consecutive
  samples (normally two). The Stop control is the only lifecycle signal.
  Loading/thinking state and assistant-text fingerprints are diagnostic only.
- If monitoring starts after Pro already finished, accept two absent samples
  only when the newest assistant turn and expected artifact are both visible.
- Do not emit a periodic heartbeat and do not re-arm on intermediate changes.
- Notify early only for a visible login/error blocker, missing page/tab, or user
  interruption.
- A released control binding is not tab loss. On each sample, if the saved tab
  binding is stale, silently list the user-open in-app tabs, require exactly one
  exact match for the saved conversation URL, reclaim it, and retry that sample
  once. Notify only if the exact tab is absent or ambiguous.
- Do not call `yield_control()` or `notify()`. They can return control early and
  their later output may be buffered indefinitely by the host.
- Keep the original `functions.exec` call pending. The template uses a
  ten-minute host yield window. If the host returns a running-cell identifier,
  resume that exact cell with `functions.wait`; never start a second monitor.
- Never run another tool in parallel with the monitor cell. If new work needs a
  tool, terminate the monitor first.

The monitor must call `scripts/pro_monitor_hook.mjs` through the persistent
Node-backed browser session. A shell process cannot authenticate to or inspect
the Codex in-app Browser by itself.

Use `scripts/pro_monitor_exec_template.mjs` as the `functions.exec` source when
that host primitive is available. First configure
`globalThis.__chatgptProMonitor` in the persistent Node browser kernel with the
task tab, in-app browser binding, exact saved conversation URL, escaped expected
archive name, absolute hook path, `pollMs: 5000`, and `absentPolls: 2`. The
template keeps one tool call pending, silently reclaims a released exact-match
tab, stays silent through intermediate changes, and returns once on completion
or an explicit exception.

Do not add an external bus or streaming-output bridge unless the host is proven
to inject incremental output from a still-running task. A bus stream that
buffers until manually read does not wake Codex. If the host cannot keep or
resume the pending cell, fall back to one compact state check every ten
minutes; do not claim event-driven or zero-token monitoring.

## Why the loop belongs in the host

The in-app Browser currently terminates a single CDP `Runtime.evaluate` after
roughly 20 seconds. Keep each DOM capture short and put the long-lived polling
loop in the host-side monitor primitive.
