// functions.exec source template. It is not a standalone Node CLI.
//
// Before starting this cell, configure the persistent Node browser kernel:
//
// globalThis.__chatgptProMonitor = {
//   tab: proTab,
//   expectedArtifact: "task-pro-output\\.zip",
//   hookPath:
//     "/absolute/path/to/gpt-pro-expert-ally/scripts/pro_monitor_hook.mjs",
//   heartbeatMs: 600000,
//   pollMs: 5000,
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
  heartbeatMs: proMonitorConfig.heartbeatMs || 600000,
  pollMs: proMonitorConfig.pollMs || 5000
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
  const baseline = baselineEnvelope.snapshot;
  const heartbeatMs = Math.max(60000, Number(baselineEnvelope.heartbeatMs));
  const pollMs = Math.max(
    1000,
    Math.min(Number(baselineEnvelope.pollMs), 15000),
  );

  if (
    baseline.state.status !== "ready" ||
    baseline.state.blocker.length > 0 ||
    !baseline.state.generating
  ) {
    notify(
      JSON.stringify({ reason: "initial-attention", state: baseline.state }),
    );
    exit();
  }

  text("pro-monitor-armed");
  yield_control();

  const deadline = Date.now() + heartbeatMs;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const current = (await capture()).snapshot;
    if (current.fingerprint !== baseline.fingerprint) {
      notify(JSON.stringify({ reason: "changed", state: current.state }));
      break;
    }
    if (Date.now() >= deadline) {
      notify(JSON.stringify({ reason: "heartbeat", state: current.state }));
      break;
    }
  }
} catch (error) {
  notify(
    JSON.stringify({
      reason: "error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}
