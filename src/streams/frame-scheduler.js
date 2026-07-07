/**
 * Frame-Budgeted Event Loop Scheduler.
 * Empties the priority queue during requestAnimationFrame (rAF) cycles.
 * Ensures JS execution remains under a strict runtime budget to prevent UI frame-rate jank.
 */
export class FrameScheduler {
  /**
   * @param {object} priorityQueue - Shared PriorityQueue instance
   * @param {function} executeCallback - Processing handler mapping events to the UI
   * @param {number} [frameBudgetMs] - Strict computation budget in ms (defaults to 10ms for 60fps safety)
   */
  constructor(priorityQueue, executeCallback, frameBudgetMs = 10) {
    this.queue = priorityQueue;
    this.executeCallback = executeCallback;
    this.budget = frameBudgetMs;
    this.isRunning = false;
    this.rafId = null;
  }

  /**
   * Starts the frame scheduling engine.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._loop();
  }

  /**
   * Pauses the frame scheduling loop.
   */
  stop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Master animation-frame loop coordinator.
   * Runs inside high-frequency browser paint boundaries.
   * @private
   */
  _loop() {
    if (!this.isRunning) return;

    const startTime = performance.now();

    // Drain the heap queue until empty OR until we exceed our allocated execution budget
    while (!this.queue.isEmpty()) {
      const elapsed = performance.now() - startTime;

      // Budget Safety Guard: Yield back and pause queue consumption if the frame budget is exceeded
      if (elapsed >= this.budget) {
        break;
      }

      // Extract the highest-priority message sorted instantly in O(log N) time
      const event = this.queue.pop();
      if (event) {
        try {
          this.executeCallback(event);
        } catch (err) {
          console.error("FrameScheduler callback execution failed:", err);
        }
      }
    }

    // Keep the animation loop ticking
    this.rafId = requestAnimationFrame(() => this._loop());
  }
}
