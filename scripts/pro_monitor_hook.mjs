const DEFAULT_LABELS = Object.freeze({
  stop: ["停止回答", "Stop generating"],
  ignoredButtons: [
    "添加文件等",
    "Attach files",
    "Pro",
    "开始听写",
    "Start dictation",
    "立即回答",
    "Answer now",
    "复制消息",
    "Copy message",
    "编辑消息",
    "Edit message",
    "展开收起",
    "Expand collapse",
  ],
});

const ACTIVE_THINKING_SELECTOR = [
  ".loading-shimmer-tertiary",
  '[data-state="loading"]',
  '[aria-busy="true"]',
].join(",");

const ASSISTANT_TURN_SELECTOR = [
  '[data-message-author-role="assistant"]',
  'article[data-turn="assistant"]',
].join(",");

function normalizeLabels(labels = {}) {
  return {
    stop: Array.isArray(labels.stop) ? labels.stop : DEFAULT_LABELS.stop,
    ignoredButtons: Array.isArray(labels.ignoredButtons)
      ? labels.ignoredButtons
      : DEFAULT_LABELS.ignoredButtons,
  };
}

export async function captureProState(tab, options = {}) {
  const labels = normalizeLabels(options.labels);
  const expectedArtifact = options.expectedArtifact || "\\.zip(?:\\b|$)";

  return tab.playwright.evaluate(
    ({
      labels: pageLabels,
      expectedArtifact: artifactPattern,
      activeThinkingSelector,
      assistantTurnSelector,
    }) => {
      const visible = (element) =>
        !!element && element.getClientRects().length > 0;
      const compactHash = (value) => {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
          hash ^= value.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
      };
      const main = document.querySelector("main");
      if (!main) {
        return {
          fingerprint: JSON.stringify({ status: "missing-main" }),
          state: { status: "missing-main" },
        };
      }

      const buttonNames = Array.from(main.querySelectorAll("button"))
        .filter(visible)
        .map((button) =>
          (
            button.getAttribute("aria-label") ||
            button.textContent ||
            ""
          ).trim(),
        )
        .filter(Boolean);
      const thinkingLabels = Array.from(
        main.querySelectorAll(activeThinkingSelector),
      )
        .filter(visible)
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean);
      const paragraphs = Array.from(main.querySelectorAll("p"))
        .filter(visible)
        .map((paragraph) => (paragraph.textContent || "").trim())
        .filter(Boolean);
      const links = Array.from(main.querySelectorAll("a"))
        .filter(visible)
        .map((link) => ({
          text: (link.textContent || "").trim(),
          href: link.getAttribute("href") || "",
        }));
      const assistantTurns = Array.from(
        main.querySelectorAll(assistantTurnSelector),
      ).filter(visible);
      const newestAssistantTurn = assistantTurns.at(-1) || null;
      const assistantTurnText = newestAssistantTurn
        ? (newestAssistantTurn.innerText || newestAssistantTurn.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
        : "";
      const blocker = Array.from(
        main.querySelectorAll(
          '[role="alert"], [data-state="error"], [data-testid*="error" i]',
        ),
      )
        .filter(visible)
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean)
        .slice(-3);

      const stopSet = new Set(pageLabels.stop);
      const ignored = new Set([...pageLabels.stop, ...pageLabels.ignoredButtons]);
      const artifactRegex = new RegExp(artifactPattern, "i");
      const generationControlActive =
        main.querySelector('[data-testid="stop-button"]') !== null ||
        buttonNames.some((name) => stopSet.has(name));
      const thinkingActive = thinkingLabels.length > 0;
      const artifactButtons = buttonNames
        .filter((name) => artifactRegex.test(name))
        .map((name) => ({ text: name, href: "", kind: "button" }));
      const downloadCandidates = links
        .filter(({ text, href }) => artifactRegex.test(`${text} ${href}`))
        .map((candidate) => ({ ...candidate, kind: "link" }))
        .concat(artifactButtons)
        .slice(-5);
      const completionFingerprint = JSON.stringify({
        assistantTurnPresent: newestAssistantTurn !== null,
        assistantTurnHash: compactHash(assistantTurnText),
        assistantTurnTextChars: assistantTurnText.length,
        downloadCandidates,
      });
      const state = {
        status: "ready",
        // The Stop control is the sole lifecycle signal. Thinking/loading
        // elements are useful diagnostics but are too noisy for completion.
        generating: generationControlActive,
        generationControlActive,
        thinkingActive,
        assistantTurnPresent: newestAssistantTurn !== null,
        assistantTurnFingerprint: completionFingerprint,
        thinkingLabels: thinkingLabels.slice(-3),
        activity: buttonNames
          .filter((name) => !ignored.has(name))
          .slice(-10),
        lastAssistant: paragraphs.slice(-4),
        blocker,
        downloadCandidates,
      };
      return { fingerprint: completionFingerprint, state };
    },
    {
      labels,
      expectedArtifact,
      activeThinkingSelector: ACTIVE_THINKING_SELECTOR,
      assistantTurnSelector: ASSISTANT_TURN_SELECTOR,
    },
    { timeoutMs: 10000 },
  );
}

export async function captureLatestAssistantDelivery(tab, options = {}) {
  const expectedArtifact = options.expectedArtifact || "\\.zip(?:\\b|$)";
  const maxTextChars = Math.max(
    1000,
    Math.min(Number(options.maxTextChars ?? 60000), 250000),
  );

  return tab.playwright.evaluate(
    ({
      expectedArtifact: artifactPattern,
      assistantTurnSelector,
      maxText,
    }) => {
      const visible = (element) =>
        !!element && element.getClientRects().length > 0;
      const main = document.querySelector("main");
      if (!main) {
        return {
          found: false,
          conversationUrl: location.href,
          text: "",
          textTruncated: false,
          downloadCandidates: [],
          reason: "missing-main",
        };
      }

      const assistantTurns = Array.from(
        main.querySelectorAll(assistantTurnSelector),
      ).filter(visible);
      const turn = assistantTurns.at(-1);
      if (!turn) {
        return {
          found: false,
          conversationUrl: location.href,
          text: "",
          textTruncated: false,
          downloadCandidates: [],
          reason: "missing-assistant-turn",
        };
      }

      const fullText = (turn.innerText || turn.textContent || "").trim();
      const artifactRegex = new RegExp(artifactPattern, "i");
      const links = Array.from(turn.querySelectorAll("a"))
        .filter(visible)
        .map((link) => ({
          kind: "link",
          text: (link.textContent || "").trim(),
          href: link.getAttribute("href") || "",
        }))
        .filter(({ text, href }) => artifactRegex.test(`${text} ${href}`));
      const buttons = Array.from(turn.querySelectorAll("button"))
        .filter(visible)
        .map((button) => ({
          kind: "button",
          text: (
            button.getAttribute("aria-label") ||
            button.textContent ||
            ""
          ).trim(),
          href: "",
        }))
        .filter(({ text }) => artifactRegex.test(text));

      return {
        found: true,
        conversationUrl: location.href,
        text: fullText.slice(0, maxText),
        textChars: fullText.length,
        textTruncated: fullText.length > maxText,
        downloadCandidates: links.concat(buttons),
        reason: null,
      };
    },
    {
      expectedArtifact,
      assistantTurnSelector: ASSISTANT_TURN_SELECTOR,
      maxText: maxTextChars,
    },
    { timeoutMs: 10000 },
  );
}

export async function waitForProTurnCompletion(tab, options = {}) {
  const requestedTimeout = Number(options.timeoutMs ?? 15000);
  const timeoutMs = Math.max(1000, Math.min(requestedTimeout, 15000));
  const pollMs = Math.max(250, Math.min(Number(options.pollMs ?? 1000), 5000));
  const absentPolls = Math.max(
    1,
    Math.min(Number(options.absentPolls ?? 2), 10),
  );
  const deadline = Date.now() + timeoutMs;
  let seenGenerationControl = false;
  let absentCount = 0;

  while (Date.now() < deadline) {
    const current = await captureProState(tab, options);
    const { state } = current;

    if (state.status !== "ready") {
      return { reason: "error", ...current };
    }
    if (state.blocker.length > 0) {
      return { reason: "blocker", ...current };
    }
    if (state.generationControlActive) {
      seenGenerationControl = true;
      absentCount = 0;
    } else if (
      seenGenerationControl ||
      (state.assistantTurnPresent && state.downloadCandidates.length > 0)
    ) {
      absentCount += 1;
      if (absentCount >= absentPolls) {
        return { reason: "completed", ...current };
      }
    } else {
      absentCount = 0;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return {
    reason: "timeout",
    ...(await captureProState(tab, options)),
  };
}
