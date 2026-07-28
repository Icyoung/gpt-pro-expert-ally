// functions.exec source template. It is not a standalone Node CLI.
//
// Before starting this cell, configure the persistent Node browser kernel:
//
// globalThis.__chatgptProMonitor = {
//   tab: proTab,
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
if (!proMonitorConfig?.tab || !proMonitorConfig?.hookPath) {
  throw new Error("missing __chatgptProMonitor browser configuration");
}
var proMonitorModule = await import(proMonitorConfig.hookPath);
var proMonitorSnapshot = await proMonitorModule.captureProState(
  proMonitorConfig.tab,
  { expectedArtifact: proMonitorConfig.expectedArtifact }
);
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
  return JSON.parse(block.text);
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
