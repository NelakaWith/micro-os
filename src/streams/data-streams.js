/**
 * Async Generator simulating high-frequency operating system metrics.
 * Continuously yields simulated system telemetry logs with varying priority classifications.
 * @param {number} [intervalMs] - Delay between yielded events
 */
export async function* systemMetricsStream(intervalMs = 250) {
  const metrics = [
    { type: "CPU", message: "Core instruction pipeline update", priority: 4 },
    { type: "RAM", message: "V8 heap partition sweep completed", priority: 5 },
    {
      type: "GC",
      message: "Incremental garbage collection sweep executed",
      priority: 3,
    },
    {
      type: "IO",
      message: "Database transaction index updated in memory",
      priority: 4,
    },
  ];

  const warnings = [
    {
      type: "WARN",
      message: "Main Thread event loop execution delay detected",
      priority: 2,
    },
    {
      type: "WARN",
      message: "In-Memory query cache fragmentation exceeding limits",
      priority: 2,
    },
    {
      type: "WARN",
      message: "Off-thread hardware pipeline core temperature spikes",
      priority: 2,
    },
  ];

  const critical = [
    {
      type: "FATAL",
      message: "CRITICAL: Engine Heap Partition Exceeding Safe Threshold",
      priority: 1,
    },
    {
      type: "FATAL",
      message:
        "SYSTEM: Simulated Low Memory (Aborting pending transaction pipelines)",
      priority: 1,
    },
  ];

  while (true) {
    // Yield execution back to the browser for the specified delay threshold
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const rng = Math.random();

    if (rng < 0.05) {
      // 5% chance of high-priority critical system emergency alerts (Priority 1)
      const alert = critical[Math.floor(Math.random() * critical.length)];
      yield { ...alert, timestamp: Date.now() };
    } else if (rng < 0.2) {
      // 15% chance of process warning signals (Priority 2)
      const alert = warnings[Math.floor(Math.random() * warnings.length)];
      yield { ...alert, timestamp: Date.now() };
    } else {
      // 80% chance of typical baseline diagnostic updates (Priority 4-5)
      const alert = metrics[Math.floor(Math.random() * metrics.length)];
      yield { ...alert, timestamp: Date.now() };
    }
  }
}
