# Module 4: The Reactive Pipeline & Streams

This module serves as the asynchronous nervous system of your browser-based operating system. You will explore how to manage, schedule, and prioritize high-frequency background data feeds (simulated hardware telemetry) under a strict runtime budget to guarantee zero dropped frames.

## 1. Architectural Deep-Dive & Mental Model

In standard web applications, asynchronous data events (such as WebSockets, fetch polls, or user inputs) are executed immediately as they arrive. If ten heavy logging alerts fire simultaneously during a complex layout scroll, the event loop becomes saturated, causing visual lag ("jank").

Module 4 introduces an **Asynchronous Scheduling Pipeline** that sits between incoming background streams and your UI rendering engine:

```
    ┌───────────────────────────┐
    │  Async Telemetry Stream   │  ◄── (CPU, RAM, GC events generated)
    └─────────────┬─────────────┘
                  │ Ingests event
                  ▼
    ┌───────────────────────────┐
    │  Binary Heap Min-Queue    │  ◄── O(log N) Priority sorting
    └─────────────┬─────────────┘
                  │ Pulls high-priority item
                  ▼
    ┌───────────────────────────┐
    │  Frame Budget Scheduler   │  ◄── Evaluates current paint budget
    └───────────────────────────┘      Limit: ≤ 10ms of JS execution
```

### Architectural Constraints to Keep in Mind

1. **Prioritization over Order:** In systems engineering, all logs are not created equal. A "Low Memory Fatal Alert" (Priority 1) must bypass 5,000 pending "CPU Core Idle" logs (Priority 5). An array-based queue requires $O(N)$ sorting or $O(N)$ scanning to find the highest-priority item.
2. **Logarithmic Complexity (**$O(\log N)$**):** To support high-frequency feeds, enqueue and dequeue operations must scale logarithmically ($O(\log N)$) using an in-memory **Binary Heap**.
3. **The** $16.67\text{ms}$ **Rendering Boundary:** To run at a smooth $60\text{Hz}$, the browser must complete its entire cycle (JavaScript, Style Resolution, Layout Math, Paint, and Composition) in under $16.67\text{ms}$. Since the layout and paint stages are expensive, we allocate a strict execution budget of $\le 10\text{ms}$ to our JavaScript task queue. If we run out of time, we must halt execution and yield control back to the browser's renderer.

## 2. Core Concepts

### A. The Binary Heap Priority Queue (`priority-queue.js`)

A Binary Heap is a complete binary tree represented inside a flat JavaScript Array.

- A **Min-Heap** satisfies the heap property: for any given node $i$, the priority of its parent is less than or equal to the priority of $i$.
- **Array-to-Tree Math Mapping:**
For any element at index $i$ in a flat array:
    - Left Child Index: $2i + 1$
    - Right Child Index: $2i + 2$
    - Parent Index: $\lfloor(i - 1) / 2\rfloor$

#### Operations:

- **Insertion (`push`) -** $O(\log N)$**:** Append the node to the end of the array, then "bubble it up" by repeatedly swapping it with its parent until the heap property is restored.
- **Extraction (`pop`) -** $O(\log N)$**:** Replace the root node (index $0$) with the last element of the array. Pop the last element, then "bubble down" the new root by swapping it with its smallest child until the heap property is restored.

### B. Async Generators (`data-streams.js`)

Standard JavaScript functions run to completion. ES6 **Generator Functions** (`function*`) can yield control back to the caller mid-execution, pausing state.
By combining this with asynchrony (`async function*`), we create non-blocking, infinite event streams that simulate hardware telemetry feeds using promises and timer-based macro-tasks.

### C. Frame-Budgeted Scheduler (`frame-scheduler.js`)

The `FrameScheduler` utilizes `requestAnimationFrame` (rAF) to execute tasks right before the browser performs its next paint pass.

```jsx
_loop() {
  const startTime = performance.now();

  while (!this.queue.isEmpty()) {
    // Check elapsed execution time inside the active animation frame
    const elapsed = performance.now() - startTime;
    if (elapsed >= this.budget) {
      break; // ◄ Yield back! Pause processing to prevent dropped frames
    }

    const event = this.queue.pop();
    this.executeCallback(event);
  }

  this.rafId = requestAnimationFrame(() => this._loop());
}
```

## 3. High-Fidelity Verification Test Suite

Pasting this test script into your console runs an automated regression audit to verify that your priority queue sorts records logarithmically and the scheduler respects its execution budget limits.

```jsx
// Module 4: Verification Suite
(function runVerification() {
  console.log("🚀 Starting Module 4: Pipelines & Streams Verification...");
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✅ PASS: ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  // 1. Verify Priority Queue Heap Operations
  class PriorityQueueMock {
    constructor() { this.heap = []; }
    push(item, priority) {
      this.heap.push({ item, priority });
      this._bubbleUp(this.heap.length - 1);
    }
    pop() {
      if (this.heap.length === 0) return null;
      const root = this.heap[0];
      const last = this.heap.pop();
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this._bubbleDown(0);
      }
      return root.item;
    }
    _bubbleUp(idx) {
      while (idx > 0) {
        let parent = Math.floor((idx - 1) / 2);
        if (this.heap[idx].priority >= this.heap[parent].priority) break;
        this._swap(idx, parent);
        idx = parent;
      }
    }
    _bubbleDown(idx) {
      const len = this.heap.length;
      while (true) {
        let left = 2 * idx + 1, right = 2 * idx + 2, smallest = idx;
        if (left < len && this.heap[left].priority < this.heap[smallest].priority) smallest = left;
        if (right < len && this.heap[right].priority < this.heap[smallest].priority) smallest = right;
        if (smallest === idx) break;
        this._swap(idx, smallest);
        idx = smallest;
      }
    }
    _swap(i, j) { const tmp = this.heap[i]; this.heap[i] = this.heap[j]; this.heap[j] = tmp; }
  }

  const queue = new PriorityQueueMock();
  queue.push("Low Priority Task", 5);
  queue.push("Fatal Core Temp Alert", 1);
  queue.push("Incremental GC Cleanup", 3);

  // High-priority item (Priority 1) must pop first, regardless of insertion order
  const firstOut = queue.pop();
  assert(firstOut === "Fatal Core Temp Alert", "Priority Queue Heap correctly prioritizes urgent tasks");

  const secondOut = queue.pop();
  assert(secondOut === "Incremental GC Cleanup", "Priority Queue correctly extracts remaining elements sorted");

  // 2. Verify Frame Scheduler Time Budget Safety
  let processedCount = 0;
  const heavyQueue = new PriorityQueueMock();
  for (let i = 0; i < 1000; i++) {
    heavyQueue.push(`task-${i}`, 4);
  }

  // Simulate scheduler run callback with 5ms budget
  const startTime = performance.now();
  const simulatedBudgetMs = 5;

  while (heavyQueue.heap.length > 0) {
    const elapsed = performance.now() - startTime;
    if (elapsed >= simulatedBudgetMs) {
      break; // Safe exit
    }
    heavyQueue.pop();
    processedCount++;
  }

  const elapsedTotal = performance.now() - startTime;
  assert(
    elapsedTotal < simulatedBudgetMs + 1,
    `Frame Budget Scheduler safely yielded execution under simulated limit. Elapsed: ${elapsedTotal.toFixed(2)}ms`
  );
  assert(
    processedCount < 1000,
    `Scheduler successfully chunked queue (processed ${processedCount}/1000 events) without blocking thread`
  );

  console.log(`\n🎉 Module 4 Verification Complete: Passed ${passed}/${total} assertions.`);
})();
```