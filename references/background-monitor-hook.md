# Background Monitor Hook

Use the host-side monitor only while Codex has no other tool work to perform.
It reduces monitoring token use by polling the compact browser fingerprint
inside an already-running tool cell and waking the model only after the current
Pro turn is stably complete. Explicit blocker and tab-failure notifications are
the only early exceptions.

## Contract

- Poll compact state every 5 seconds inside the host cell. Each poll is a
  bounded DOM read and does not capture or return a screenshot.
- While the visible Stop control is present, absorb every fingerprint and
  semantic change internally. Do not notify Codex.
- Once the Stop control is absent, compare the newest assistant-turn
  fingerprint with the preceding five-second sample. Notify `completed` only
  after two consecutive fingerprints match. Loading/thinking elements are
  diagnostic only and never gate completion.
- An unchanged fingerprint while generation is active is not completion.
- Do not emit a periodic heartbeat and do not re-arm on intermediate changes.
- Notify early only for a visible login/error blocker, missing page/tab, or user
  interruption.
- After the cell yields `pro-monitor-armed`, do not call a foreground wait tool.
  End the Codex turn; the custom completion notification will resume it.
- Never run another tool in parallel with the monitor cell. If new work needs a
  tool, terminate the monitor first.

The monitor must call `scripts/pro_monitor_hook.mjs` through the persistent
Node-backed browser session. A shell process cannot authenticate to or inspect
the Codex in-app Browser by itself.

Use `scripts/pro_monitor_exec_template.mjs` as the `functions.exec` source when
that host primitive is available. First configure
`globalThis.__chatgptProMonitor` in the persistent Node browser kernel with the
task tab, escaped expected archive name, absolute hook path, `pollMs: 5000`,
and `stablePolls: 2`. The template yields immediately, stays silent through
intermediate changes, sends one custom notification on stable completion or an
explicit exception, and then exits.

If the host lacks a yielded/background tool cell with change notifications,
fall back to one compact state check every ten minutes. Do not claim an
event-driven or zero-token hook in that environment.

## Why the loop belongs in the host

The in-app Browser currently terminates a single CDP `Runtime.evaluate` after
roughly 20 seconds. Keep each DOM capture short and put the long-lived polling
loop in the host-side monitor primitive.
