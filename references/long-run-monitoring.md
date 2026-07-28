# Long-Run Monitoring

ChatGPT Pro engineering runs may take many minutes. Monitor observable state,
not elapsed time.

## Polling policy

1. Verify send and generation immediately.
2. Arm the host-side semantic monitor after the initial verification.
3. Wake on a fingerprint change; otherwise return one heartbeat after ten
   minutes and re-arm. In the current in-app Browser fallback, sample the
   compact fingerprint every five seconds as the user's selected low-latency
   mode; this is a DOM read, not a screenshot.
4. Do not emit a full DOM snapshot on every poll.
5. Snapshot only when the state fingerprint changes, an error appears, Pro asks
   for input, generation completes, or a locator becomes ambiguous.

Read `background-monitor-hook.md`. The host-side yielded monitor is preferred
over a blocking model-side sleep loop.

For the browser-bound hook, import
`scripts/pro_monitor_hook.mjs` from the persistent Node browser session:

```js
const monitor = await import("<skill-dir>/scripts/pro_monitor_hook.mjs");
const initial = await monitor.captureProState(tab, {
  expectedArtifact: "task-name-pro-output\\.zip",
});
const event = await monitor.waitForProStateChange(
  tab,
  initial.fingerprint,
  {
    expectedArtifact: "task-name-pro-output\\.zip",
    timeoutMs: 15000,
  },
);
```

This direct helper is only a short fallback because one in-page CDP evaluation
is terminated at roughly 20 seconds. The ten-minute heartbeat belongs in the
host-side yielded monitor, which invokes `captureProState` repeatedly without
returning full DOM data to the model.

## Cheap state fingerprint

Use one bounded read-only evaluation against the current `main` element. Adapt
localized labels from the latest snapshot; do not guess them.

Capture only:

- whether a visible stop-generation control exists (prefer the structural
  `[data-testid="stop-button"]` signal, with localized accessible names as a
  fallback);
- whether the active Pro thinking line is present and its current text. The
  observed ChatGPT Pro DOM uses a visible `.loading-shimmer-tertiary` span for
  this line; also recognize visible `[data-state="loading"]` and
  `[aria-busy="true"]` fallbacks;
- the last 6–10 visible activity/tool labels;
- the last 2–4 assistant paragraphs;
- visible error/retry/permission text;
- links or buttons whose visible names suggest the expected artifact.

Conceptual shape:

```js
{
  generating: true,
  generationControlActive: true,
  thinkingActive: true,
  thinkingLabels: ["检索阶段流水线串行瓶颈"],
  activity: ["validated input", "running focused tests"],
  lastAssistant: ["..."],
  blocker: null,
  downloadCandidates: []
}
```

Serialize this small object and compare it with the previous fingerprint. Do not
read the whole conversation body, history sidebar, cookies, storage, or network
internals.

## User updates

Report only:

- task sent and Pro verified;
- a new substantive milestone;
- a visible blocker or `NEEDS_INPUT`;
- completion and download;
- the host-required periodic heartbeat when no milestone changed.

For an unchanged heartbeat, use one sentence. Do not restate the entire plan.

## Stalls and recovery

An unchanged activity label is not a stall by itself.

- Under 10 minutes unchanged with generation active: keep the host hook armed.
- At 10 minutes: take one fresh snapshot; check visible error, permission,
  connection, or generation controls.
- If generation is still active and no blocker is visible: continue waiting
  without reload or resend.
- If the tab is released: reclaim the exact saved conversation tab when
  possible.
- If the tab was closed: open the saved exact conversation URL in the authorized
  browser, verify the user message and current state, then resume monitoring.
- If the page shows an error: preserve the page and report the visible error.
  Never reload or resend automatically.

Never click “Answer now”, “立即回答”, stop-generation, tool-details, or unrelated
conversation controls merely to stimulate progress.

## Completion fingerprint

Treat the run as complete only when:

- stop-generation is absent;
- the visible active-thinking/loading line is absent;
- the newest assistant turn is stable across two observations;
- the final response or expected artifact control is visible.

Then take one fresh snapshot, scope to the newest assistant turn, and extract
only that turn.
