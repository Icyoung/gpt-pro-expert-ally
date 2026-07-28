# ChatGPT In-App DOM Contract

Observed against the signed-in Chinese ChatGPT UI on 2026-07-28. Prefer stable
IDs, `data-testid`, roles, and structural scoping. Never persist dynamic
`radix-*` IDs or generated class names. The one intentional class selector is
the active-thinking shimmer because the current UI exposes no semantic role for
that line.

Use `scripts/chatgpt_dom_contract.mjs` to probe the contract without a screenshot.

## New task tab

Create one new agent-controlled in-app Browser tab per delegation task:

```js
var proTab = await browser.tabs.new();
await proTab.goto("https://chatgpt.com/");
```

Do not close or repurpose the user's existing ChatGPT tabs. Within that
delegation, keep and reuse `proTab` and the exact conversation URL. A later
revision or clarification in the same task is not a new skill invocation and
must not open another tab.

The visible new-chat fallback is:

```css
a[data-testid="create-new-chat-button"][href="/"]
```

Opening a fresh tab directly at `/` is preferred; it avoids clicking an
ambiguous sidebar duplicate.

## Composer controls

| Purpose | DOM contract |
|---|---|
| Composer | `form[data-type="unified-composer"]` |
| Prompt editor | `#prompt-textarea[contenteditable="true"][role="textbox"]` scoped to the composer |
| General upload input | `input#upload-files[type="file"][multiple]` scoped to the composer |
| Attachment menu button | `button#composer-plus-btn[data-testid="composer-plus-btn"]` scoped to the composer |
| Model trigger | `button[aria-haspopup="menu"]` scoped to the composer; visible text must equal `Pro` |
| Selected model in open menu | `[role="menuitemradio"][aria-checked="true"]`; visible text must equal `Pro` |
| Pro option in open menu | `[role="menuitemradio"]` with exact visible text `Pro` |
| Send control | `button#composer-submit-button[data-testid="send-button"]`; current Chinese label is `发送提示` |
| Stop control | `button#composer-submit-button[data-testid="stop-button"]`; current Chinese label is `停止回答` |

The send control is absent while the composer is empty and appears enabled
after text is present. Verify the attachment group, exact prompt, selected Pro
model, and unique enabled send control immediately before clicking.

Use the browser API's supported file-upload operation against `#upload-files`.
Do not open a native file picker through Computer Use.

## Long-run signals

| State | DOM contract |
|---|---|
| Pro activity diagnostic | visible `.loading-shimmer-tertiary`; its text is informative only |
| Generation active | visible `[data-testid="stop-button"]`; this is the sole lifecycle signal |
| Premature-answer affordance | button named `立即回答` / `Answer now`; ignore it |
| Candidate completion | stop control absent |
| Assistant turn | newest visible `[data-message-author-role="assistant"]`; fallback `article[data-turn="assistant"]` |

After observing active generation, two consecutive samples without the Stop
control are sufficient to return the pending monitor call. Acceptance remains
separate: on the fresh completion observation, require the newest assistant
turn and the requested output ZIP or an explicit final delivery statement.
Loading/thinking DOM and assistant-text fingerprints may change, disappear, or
remain visible without changing the lifecycle decision.

At completion, scope both prose extraction and download-control discovery to
that newest assistant turn. Use `captureLatestAssistantDelivery` from
`scripts/pro_monitor_hook.mjs`; do not read only the download button and discard
the surrounding report.

## Drift policy

Use this contract first. Do not take a screenshot or invoke Computer Use on the
normal path. If a selector is missing or ambiguous:

1. run one compact DOM probe;
2. take one fresh accessibility/DOM snapshot if needed;
3. update the contract only after confirming the new stable attribute;
4. use a screenshot only when visual state is materially necessary;
5. use Computer Use only when the browser API cannot operate a required
   non-DOM/native control.

Never guess a replacement selector after UI drift.
