// functions.exec source template. It is not a standalone Node CLI.
//
// Before starting this cell, configure the persistent Node browser kernel:
//
// globalThis.__chatgptProMonitor = {
//   tab: proTab,
//   browser: iab,
//   conversationUrl: "https://chatgpt.com/c/<conversation-id>",
//   expectedArtifact: "task-pro-output\\.zip",
//   hookPath:
//     "/absolute/path/to/gpt-pro-expert-ally/scripts/pro_monitor_hook.mjs",
//   pollMs: 5000,
//   stablePolls: 2,
// };
//
// Do not run another tool in parallel with this yielded cell.

const nodeToolEntry = ALL_TOOLS.find(
  (entry) => entry.name.includes("node_repl") && entry.name.endsWith("__js"),
);
if (!nodeToolEntry) {
  notify(JSON.stringify({ reason: "error", error: "node_repl tool unavailable" }));
  exit();
}

const nodeTool = tools[nodeToolEntry.name];
const captureCode = `
var proMonitorConfig = globalThis.__chatgptProMonitor;
if (
  !proMonitorConfig?.browser ||
  !proMonitorConfig?.conversationUrl ||
  !proMonitorConfig?.hookPath
) {
  throw new Error("missing __chatgptProMonitor browser configuration");
}
var proMonitorModule = await import(proMonitorConfig.hookPath);
var captureConfiguredProTab = async () =>
  await proMonitorModule.captureProState(
    proMonitorConfig.tab,
    { expectedArtifact: proMonitorConfig.expectedArtifact }
  );
var proMonitorSnapshot;
try {
  if (!proMonitorConfig.tab) throw new Error("Tab not found");
  proMonitorSnapshot = await captureConfiguredProTab();
} catch (error) {
  var captureError = error instanceof Error ? error.message : String(error);
  if (!/tab not found|stale|closed|released/i.test(captureError)) throw error;
  var openProTabs = await proMonitorConfig.browser.user.openTabs();
  var matchingProTabs = openProTabs.filter(
    (candidate) => candidate.url === proMonitorConfig.conversationUrl
  );
  if (matchingProTabs.length !== 1) {
    throw new Error(
      "saved Pro conversation tab unavailable or ambiguous: " +
        proMonitorConfig.conversationUrl
    );
  }
  proMonitorConfig.tab = await proMonitorConfig.browser.user.claimTab(
    matchingProTabs[0]
  );
  proMonitorSnapshot = await captureConfiguredProTab();
}
nodeRepl.write(JSON.stringify({
  snapshot: proMonitorSnapshot,
  pollMs: proMonitorConfig.pollMs || 5000,
  stablePolls: proMonitorConfig.stablePolls || 2
}));
`;

const capture = async () => {
  const result = await nodeTool({
    code: captureCode,
    timeout_ms: 10000,
    title: "Capture compact Pro state",
  });
  const block = result?.content?.find((item) => item.type === "text");
  if (!block) throw new Error("monitor capture returned no text");
  try {
    return JSON.parse(block.text);
  } catch {
    throw new Error(`monitor capture failed: ${block.text}`);
  }
};

try {
  const baselineEnvelope = await capture();
  let current = baselineEnvelope.snapshot;
  const pollMs = Math.max(
    1000,
    Math.min(Number(baselineEnvelope.pollMs), 15000),
  );
  const requiredStablePolls = Math.max(
    2,
    Math.min(Number(baselineEnvelope.stablePolls), 10),
  );

  if (current.state.status !== "ready") {
    notify(
      JSON.stringify({ reason: "error", state: current.state }),
    );
    exit();
  }
  if (current.state.blocker.length > 0) {
    notify(JSON.stringify({ reason: "blocker", state: current.state }));
    exit();
  }

  text("pro-monitor-armed");
  yield_control();

  let previousCompletionFingerprint = null;
  let stableCount = 0;
  for (;;) {
    if (current.state.status !== "ready") {
      notify(JSON.stringify({ reason: "error", state: current.state }));
      break;
    }
    if (current.state.blocker.length > 0) {
      notify(JSON.stringify({ reason: "blocker", state: current.state }));
      break;
    }

    if (current.state.generating || !current.state.assistantTurnPresent) {
      previousCompletionFingerprint = null;
      stableCount = 0;
    } else if (current.fingerprint === previousCompletionFingerprint) {
      stableCount += 1;
      if (stableCount >= requiredStablePolls) {
        notify(JSON.stringify({ reason: "completed", state: current.state }));
        break;
      }
    } else {
      previousCompletionFingerprint = current.fingerprint;
      stableCount = 1;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
    current = (await capture()).snapshot;
  }
} catch (error) {
  notify(
    JSON.stringify({
      reason: "error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}
