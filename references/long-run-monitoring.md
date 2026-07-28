# Long-Run Monitoring

ChatGPT Pro engineering runs may take many minutes. Monitor observable state,
not elapsed time.

## Polling policy

1. Verify send and generation immediately.
2. Arm the host-side stable-completion monitor after the initial verification.
3. Sample every five seconds inside the host cell, without waking Codex for
   intermediate semantic or fingerprint changes.
4. Declare the turn complete only after the visible Stop control is absent and
   the newest assistant-turn fingerprint is identical in two consecutive
   samples. Loading/thinking DOM is diagnostic only.
5. Do not emit a heartbeat or a full DOM snapshot on every poll.
6. Snapshot only when an explicit blocker appears, the tab fails, generation is
   stably complete, or a locator becomes ambiguous.

Read `background-monitor-hook.md`. The host-side yielded monitor is preferred
over a blocking model-side sleep loop.

For the browser-bound hook, import
`scripts/pro_monitor_hook.mjs` from the persistent Node browser session:

```js
const monitor = await import("<skill-dir>/scripts/pro_monitor_hook.mjs");
const initial = await monitor.captureProState(tab, {
  expectedArtifact: "task-name-pro-output\\.zip",
});
const event = await monitor.waitForProTurnCompletion(
  tab,
  {
    expectedArtifact: "task-name-pro-output\\.zip",
    timeoutMs: 15000,
    pollMs: 1000,
    stablePolls: 2,
  },
);
```

This direct helper is only a short fallback because one in-page CDP evaluation
is terminated at roughly 20 seconds. The long-running loop belongs in the
host-side yielded monitor, which invokes `captureProState` repeatedly without
returning intermediate DOM data to the model.

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

Build the completion fingerprint only from the newest assistant turn and its
matching artifact candidates. Activity labels may still be captured for final
diagnostics, but must not participate in host wake-up. Do not read the whole
conversation body, history sidebar, cookies, storage, or network internals.

## User updates

Report only:

- task sent and Pro verified;
- a visible blocker or `NEEDS_INPUT`;
- completion and download.

## Stalls and recovery

An unchanged activity label is not a stall by itself.

- While generation is active: keep the host hook armed regardless of semantic
  changes or elapsed time.
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
- the newest assistant turn is stable across two observations;
- the final response or expected artifact control is visible.

Then take one fresh snapshot, scope to the newest assistant turn, and extract
only that turn. Use `captureLatestAssistantDelivery` to capture its complete
visible prose and expected download candidates in the same observation before
starting the download.
