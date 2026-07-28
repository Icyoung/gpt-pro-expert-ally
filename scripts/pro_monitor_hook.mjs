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
    }) => {
      const main = document.querySelector("main");
      if (!main) {
        return {
          fingerprint: JSON.stringify({ status: "missing-main" }),
          state: { status: "missing-main" },
        };
      }

      const buttonNames = Array.from(main.querySelectorAll("button"))
        .filter((button) => button.getClientRects().length > 0)
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
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean);
      const paragraphs = Array.from(main.querySelectorAll("p"))
        .filter((paragraph) => paragraph.getClientRects().length > 0)
        .map((paragraph) => (paragraph.textContent || "").trim())
        .filter(Boolean);
      const links = Array.from(main.querySelectorAll("a"))
        .filter((link) => link.getClientRects().length > 0)
        .map((link) => ({
          text: (link.textContent || "").trim(),
          href: link.getAttribute("href") || "",
        }));

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
      const state = {
        status: "ready",
        generating: generationControlActive || thinkingActive,
        generationControlActive,
        thinkingActive,
        thinkingLabels: thinkingLabels.slice(-3),
        activity: buttonNames
          .filter((name) => !ignored.has(name))
          .slice(-10),
        lastAssistant: paragraphs.slice(-4),
        blocker: paragraphs
          .filter((text) =>
            /(error|failed|permission|sign in|login|验证码|登录|权限|失败|错误)/i.test(
              text,
            ),
          )
          .slice(-2),
        downloadCandidates: links
          .filter(({ text, href }) => artifactRegex.test(`${text} ${href}`))
          .map((candidate) => ({ ...candidate, kind: "link" }))
          .concat(artifactButtons)
          .slice(-5),
      };
      return { fingerprint: JSON.stringify(state), state };
    },
    {
      labels,
      expectedArtifact,
      activeThinkingSelector: ACTIVE_THINKING_SELECTOR,
    },
    { timeoutMs: 10000 },
  );
}

export async function waitForProStateChange(
  tab,
  previousFingerprint,
  options = {},
) {
  const labels = normalizeLabels(options.labels);
  const expectedArtifact = options.expectedArtifact || "\\.zip(?:\\b|$)";
  const requestedTimeout = Number(options.timeoutMs ?? 55000);
  // One in-page Runtime.evaluate is currently terminated by the in-app
  // Browser at roughly 20 seconds. Long monitoring belongs in the host-side
  // yielded monitor; this helper is intentionally a short direct fallback.
  const timeoutMs = Math.max(1000, Math.min(requestedTimeout, 15000));

  return tab.playwright.evaluate(
    async ({
      labels: pageLabels,
      expectedArtifact: artifactPattern,
      activeThinkingSelector,
      previous,
      timeout,
    }) => {
      const capture = () => {
        const main = document.querySelector("main");
        if (!main) {
          const state = { status: "missing-main" };
          return { fingerprint: JSON.stringify(state), state };
        }

        const buttonNames = Array.from(main.querySelectorAll("button"))
          .filter((button) => button.getClientRects().length > 0)
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
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => (element.textContent || "").trim())
          .filter(Boolean);
        const paragraphs = Array.from(main.querySelectorAll("p"))
          .filter((paragraph) => paragraph.getClientRects().length > 0)
          .map((paragraph) => (paragraph.textContent || "").trim())
          .filter(Boolean);
        const links = Array.from(main.querySelectorAll("a"))
          .filter((link) => link.getClientRects().length > 0)
          .map((link) => ({
            text: (link.textContent || "").trim(),
            href: link.getAttribute("href") || "",
          }));

        const stopSet = new Set(pageLabels.stop);
        const ignored = new Set([
          ...pageLabels.stop,
          ...pageLabels.ignoredButtons,
        ]);
        const artifactRegex = new RegExp(artifactPattern, "i");
        const generationControlActive =
          main.querySelector('[data-testid="stop-button"]') !== null ||
          buttonNames.some((name) => stopSet.has(name));
        const thinkingActive = thinkingLabels.length > 0;
        const artifactButtons = buttonNames
          .filter((name) => artifactRegex.test(name))
          .map((name) => ({ text: name, href: "", kind: "button" }));
        const state = {
          status: "ready",
          generating: generationControlActive || thinkingActive,
          generationControlActive,
          thinkingActive,
          thinkingLabels: thinkingLabels.slice(-3),
          activity: buttonNames
            .filter((name) => !ignored.has(name))
            .slice(-10),
          lastAssistant: paragraphs.slice(-4),
          blocker: paragraphs
            .filter((text) =>
              /(error|failed|permission|sign in|login|验证码|登录|权限|失败|错误)/i.test(
                text,
              ),
            )
            .slice(-2),
          downloadCandidates: links
            .filter(({ text, href }) => artifactRegex.test(`${text} ${href}`))
            .map((candidate) => ({ ...candidate, kind: "link" }))
            .concat(artifactButtons)
            .slice(-5),
        };
        return { fingerprint: JSON.stringify(state), state };
      };

      const initial = capture();
      if (initial.fingerprint !== previous) {
        return { reason: "changed", ...initial };
      }

      return new Promise((resolve) => {
        let settled = false;
        let pollTimer;
        const finish = (reason, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(pollTimer);
          clearTimeout(heartbeatTimer);
          resolve({ reason, ...value });
        };
        const check = () => {
          const current = capture();
          if (current.fingerprint !== previous) {
            finish("changed", current);
            return;
          }
          pollTimer = setTimeout(check, 1000);
        };
        // The in-app Browser's isolated evaluation world does not expose a
        // constructible MutationObserver. This compact in-page poll does not
        // return DOM data to the model until state changes or the heartbeat
        // expires.
        pollTimer = setTimeout(check, 1000);
        const heartbeatTimer = setTimeout(() => {
          finish("heartbeat", capture());
        }, timeout);
      });
    },
    {
      labels,
      expectedArtifact,
      activeThinkingSelector: ACTIVE_THINKING_SELECTOR,
      previous: previousFingerprint,
      timeout: timeoutMs,
    },
    { timeoutMs: timeoutMs + 5000 },
  );
}
