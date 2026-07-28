# Background Monitor Hook

Use the host-side monitor only while Codex has no other tool work to perform.
It reduces monitoring token use by polling the compact browser fingerprint
inside an already-running tool cell and waking the model only on a semantic
change or a ten-minute heartbeat.

## Contract

- Poll the compact state every 5 seconds inside the host cell. This is a
  user-selected low-latency mode: each poll reads only the compact semantic
  fields and does not capture or return a screenshot.
- Do not return page HTML, full snapshots, or unchanged paragraphs each poll.
- Notify on any fingerprint change.
- If unchanged, notify once at 10 minutes and end the cell.
- Re-arm after Codex handles the change or heartbeat.
- End immediately on completion, login/error blocker, tab loss, or user
  interruption.
- Never run another tool in parallel with the monitor cell. If new work needs a
  tool, terminate the monitor first.

The monitor must call `scripts/pro_monitor_hook.mjs` through the persistent
Node-backed browser session. A shell process cannot authenticate to or inspect
the Codex in-app Browser by itself.

Use `scripts/pro_monitor_exec_template.mjs` as the `functions.exec` source when
that host primitive is available. First configure
`globalThis.__chatgptProMonitor` in the persistent Node browser kernel with the
task tab, escaped expected archive name, absolute hook path, `heartbeatMs:
600000`, and `pollMs: 5000`. The template yields immediately, sends a custom
notification on change or heartbeat, and then exits. Re-arm it after handling
that notification.

If the host lacks a yielded/background tool cell with change notifications,
fall back to one compact state check every ten minutes. Do not claim an
event-driven or zero-token hook in that environment.

## Why not a ten-minute page evaluation

The in-app Browser currently terminates a single CDP `Runtime.evaluate` after
roughly 20 seconds. Therefore, do not implement the heartbeat as one long
`setTimeout` inside the page. Keep each DOM capture short and put the sparse
loop in the host-side monitor primitive.
