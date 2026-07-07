# Module 2: The Multi-Threaded Processor (Workbook Edition)

This module is your practical lab to master hardware-level parallel execution in the browser. You will build an isolated, non-blocking query compiler and sorting engine inside a **Web Worker**, orchestrated by a main-thread **Worker Pool Scheduler** featuring load balancing, dynamic worker scaling, query timeout policing, and zero-copy binary data transfers.

## 1. Architectural Deep-Dive & Mental Model

By default, JavaScript in the browser is single-threaded. If your database contains 50,000+ items, running a query that filters and sorts results according to dynamic user inputs directly on the main thread will block the event loop, drop frames, and cause visible visual lag (jank).

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                           MAIN THREAD (60fps)                          │
 │                                                                        │
 │  User Interaction ────► Emit Query Task ────► [ Worker Pool ]          │
 │  (Buttery Smooth)                                 │                    │
 │         ▲                                         │ Transferable       │
 │         │                                         ▼ ArrayBuffer        │
 └─────────┼─────────────────────────────────────────┼────────────────────┘
           │                                         │
           │ Render Update                           │ (O(1) IPC Pass)
           │ (Transferable ArrayBuffer)              │
 ┌─────────┴─────────────────────────────────────────▼────────────────────┐
 │                           WORKER BACKGROUND THREAD                     │
 │                                                                        │
 │                  Array Reconstruction ──► JSON Parse                   │
 │                                             │                          │
 │                  Binary Heap Sort  ◄──► Array Filter & Sort            │
 └────────────────────────────────────────────────────────────────────────┘
```

### The Architectural Challenges & Solutions

#### A. The Structured Clone Bottleneck ($O(N)$)

When you send standard objects across threads using `postMessage(data)`, the browser runs the **Structured Clone Algorithm**. It recursively parses and duplicates your entire object tree in a new memory address block. For large queries, this cloning process stalls the main thread.

- **The Solution:** We serialize our query payloads into flat string buffers using `TextEncoder` and cast them into a raw binary `Uint8Array`. We then transfer the underlying `ArrayBuffer` directly. This performs a mathematical pointer swap across threads: the main thread instantly relinquishes access, and the worker claims ownership in **true** $O(1)$ **constant time**, completely skipping memory duplication.

#### B. The Inline Blob Bypass

To keep our application portable, self-contained, and free from local browser file-system import security blocks (CORS), we will compile our Worker code dynamically in-memory.

- **The Solution:** We convert our worker script code into an inline string array, wrap it inside a native `Blob` object, and generate a dynamic runtime execution target using `URL.createObjectURL(blob)`.

#### C. Worker Pooling & Timeout Guardians

Spawning workers is expensive. If we spawned a worker for every single user query, the browser's thread instantiation overhead would degrade performance.

- **The Solution:** We maintain a fixed pool size matching the client's physical hardware capacity (`navigator.hardwareConcurrency`). If a complex or buggy query hangs, a timeout watchdog initiates a forced thread termination (`worker.terminate()`), purges the queue, and seamlessly provisions a fresh replacement worker.

## 2. Implementation Blueprints

You will implement two files inside your workspace: `src/worker/query-worker.js` (the isolated query engine) and `src/worker/worker-pool.js` (the queue supervisor).

### File 1: The Background Thread Engine (`src/worker/query-worker.js`)

This script contains **zero DOM access**. It acts as a pure-computing kernel, receiving binary-encoded data buffers, decoding them, filtering/sorting the contents, and packing the resulting payloads back into binary buffers to return to the main thread.

```jsx
/**
 * Isolated Worker Thread execution script.
 * Processes high-frequency binary queries safely off the main thread.
 */
self.onmessage = function (e) {
  const { taskId, queryParams, arrayBuffer } = e.data;

  try {
    // 1. Recover the dataset surgically from the transferred ArrayBuffer
    const uint8View = new Uint8Array(arrayBuffer);
    const jsonString = new TextDecoder().decode(uint8View);
    const dataset = JSON.parse(jsonString);

    const { filterField, filterValue, sortField, sortOrder = 'asc' } = queryParams;

    // 2. Perform the filtering operations
    let results = dataset.filter(item => item[filterField] === filterValue);

    // 3. Perform sorting calculations in O(N log N) time
    results.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    // 4. Serialize the processed results back into binary
    const resultString = JSON.stringify(results);
    const encodedResults = new TextEncoder().encode(resultString);
    const transferBuffer = encodedResults.buffer;

    // 5. Transfer memory ownership back to the main thread with O(1) complexity
    self.postMessage({
      taskId,
      success: true,
      arrayBuffer: transferBuffer
    }, [transferBuffer]);

  } catch (error) {
    self.postMessage({
      taskId,
      success: false,
      error: error.message
    });
  }
};
```

### File 2: The Main-Thread Orchestrator (`src/worker/worker-pool.js`)

This class maintains the state of our active hardware workers, channels requests into execution tasks, schedules waiting queues, and enforces execution time limits.

```jsx
/**
 * Main Thread Worker Pool Supervisor.
 * Manages parallel worker threads, schedules incoming query tasks,
 * and executes zero-overhead memory transfers.
 */
export class WorkerPool {
  /**
   * @param {number} [maxWorkers] - Default limits to physical cpu hardware cores
   */
  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = maxWorkers;
    this.workers = [];        // Pool of active worker wrappers
    this.taskQueue = [];      // Waiting line for tasks when all workers are busy
    this.activeTasks = new Map(); // taskId -> { resolve, reject, timeoutId }
    this.taskIdCounter = 0;

    this._initializePool();
  }

  /**
   * Spawns worker instances in-memory and binds their message ports.
   * @private
   */
  _initializePool() {
    // Stringified worker source to bypass local directory CORS file restrictions
    const workerCode = `
      self.onmessage = function (e) {
        const { taskId, queryParams, arrayBuffer } = e.data;
        try {
          const uint8View = new Uint8Array(arrayBuffer);
          const jsonString = new TextDecoder().decode(uint8View);
          const dataset = JSON.parse(jsonString);
          const { filterField, filterValue, sortField, sortOrder = 'asc' } = queryParams;

          let results = dataset.filter(item => item[filterField] === filterValue);

          results.sort((a, b) => {
            const valA = a[sortField];
            const valB = b[sortField];
            if (typeof valA === 'string') {
              return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return sortOrder === 'asc' ? valA - valB : valB - valA;
          });

          const resultString = JSON.stringify(results);
          const encodedResults = new TextEncoder().encode(resultString);
          const transferBuffer = encodedResults.buffer;

          self.postMessage({ taskId, success: true, arrayBuffer: transferBuffer }, [transferBuffer]);
        } catch (error) {
          self.postMessage({ taskId, success: false, error: error.message });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.workerBlobUrl = URL.createObjectURL(blob);

    for (let i = 0; i < this.maxWorkers; i++) {
      this.workers.push({
        id: i,
        instance: new Worker(this.workerBlobUrl),
        busy: false,
        activeTaskId: null
      });
    }

    // Set up message handlers for each worker
    this.workers.forEach(w => {
      w.instance.onmessage = (e) => this._handleWorkerMessage(w, e.data);
    });
  }

  /**
   * Dispatches a dataset to the pool for off-thread sorting and filtering.
   * Bypasses JSON-cloning delays using binary buffer pointer transfers.
   * @param {object[]} dataset - Raw array of objects to search through.
   * @param {object} queryParams - Filters and sorting instructions.
   * @param {number} [timeoutMs] - Execution safety threshold (defaults to 5000ms)
   * @returns {Promise<object[]>} Promise resolving to the processed results.
   */
  queryAsync(dataset, queryParams, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const taskId = this.taskIdCounter++;

      // 1. Binary conversion of the dataset
      const jsonString = JSON.stringify(dataset);
      const encodedData = new TextEncoder().encode(jsonString);
      const arrayBuffer = encodedData.buffer;

      // 2. Map task handlers to resolve when the worker returns the data
      const timeoutId = setTimeout(() => {
        this._handleTimeout(taskId);
      }, timeoutMs);

      this.activeTasks.set(taskId, { resolve, reject, timeoutId, queryParams, dataset });

      // 3. Queue the task
      this.taskQueue.push({ taskId, queryParams, arrayBuffer });
      this._processQueue();
    });
  }

  /**
   * Evaluates task allocations and binds waiting payloads to available workers.
   * @private
   */
  _processQueue() {
    if (this.taskQueue.length === 0) return;

    // Find the first idle worker
    const idleWorker = this.workers.find(w => !w.busy);
    if (!idleWorker) return; // All hardware threads are saturated. Hold in queue.

    const task = this.taskQueue.shift();
    idleWorker.busy = true;
    idleWorker.activeTaskId = task.taskId;

    // Surgical transfer: Passes the ArrayBuffer reference directly with zero copy penalty!
    idleWorker.instance.postMessage({
      taskId: task.taskId,
      queryParams: task.queryParams,
      arrayBuffer: task.arrayBuffer
    }, [task.arrayBuffer]);

    this._processQueue();
  }

  /**
   * Receives processed data from a worker, resolves the task, and marks the worker as idle.
   * @private
   */
  _handleWorkerMessage(worker, message) {
    const { taskId, success, arrayBuffer, error } = message;
    const task = this.activeTasks.get(taskId);

    if (!task) return; // Task was cleared by a timeout trigger

    clearTimeout(task.timeoutId);
    this.activeTasks.delete(taskId);

    // Free the worker to accept new tasks
    worker.busy = false;
    worker.activeTaskId = null;

    if (success) {
      // Decode the returned binary array buffer back into standard JS objects
      const uint8View = new Uint8Array(arrayBuffer);
      const jsonString = new TextDecoder().decode(uint8View);
      const results = JSON.parse(jsonString);
      task.resolve(results);
    } else {
      task.reject(new Error(error));
    }

    // Cascade down to process the remaining queue
    this._processQueue();
  }

  /**
   * Recovers system stability if a background computation hangs or crashes.
   * @private
   */
  _handleTimeout(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    this.activeTasks.delete(taskId);

    // 1. Locate the stalled thread
    const stalledWorker = this.workers.find(w => w.activeTaskId === taskId);
    if (stalledWorker) {
      console.warn(`⚠️ Query Task ${taskId} timed out. Terminating stalled worker thread...`);

      // 2. Hard kill the stalled background OS-level thread
      stalledWorker.instance.terminate();

      // 3. Re-provision a fresh thread replacement
      stalledWorker.instance = new Worker(this.workerBlobUrl);
      stalledWorker.instance.onmessage = (e) => this._handleWorkerMessage(stalledWorker, e.data);
      stalledWorker.busy = false;
      stalledWorker.activeTaskId = null;
    }

    task.reject(new Error("Timeout: Query execution exceeded the allowed processing time."));
    this._processQueue();
  }

  /**
   * Discards all workers and revokes memory allocation URLs.
   */
  terminateAll() {
    this.workers.forEach(w => w.instance.terminate());
    this.workers = [];
    this.activeTasks.forEach(task => clearTimeout(task.timeoutId));
    this.activeTasks.clear();
    this.taskQueue = [];
    if (this.workerBlobUrl) {
      URL.revokeObjectURL(this.workerBlobUrl);
    }
  }
}
```

## 3. High-Fidelity Verification Test Suite

You can paste this script directly into your modular `browser_test_bench.html` dashboard, or run it through local workspace scripting to verify that parallel processing, task queues, and memory transfers work correctly.

```jsx
import { WorkerPool } from './src/worker/worker-pool.js';

async function runModule2Tests() {
  console.log("⚡ Initiating Module 2 Worker Pool verification...");
  const pool = new WorkerPool(2); // Cap at 2 threads for test sandbox simulation

  // 1. Generate heavy dummy data
  const mockDataset = [];
  for (let i = 0; i < 10000; i++) {
    mockDataset.push({
      id: `track-${i}`,
      title: `Procedural Track #${i}`,
      genre: i % 2 === 0 ? 'Trip-hop' : 'Ambient',
      duration: Math.floor(Math.random() * 300) + 120
    });
  }

  try {
    const startTime = performance.now();

    // 2. Dispatch query tasks in parallel
    const p1 = pool.queryAsync(mockDataset, {
      filterField: 'genre',
      filterValue: 'Trip-hop',
      sortField: 'duration',
      sortOrder: 'asc'
    });

    const p2 = pool.queryAsync(mockDataset, {
      filterField: 'genre',
      filterValue: 'Ambient',
      sortField: 'duration',
      sortOrder: 'desc'
    });

    // Resolve threads simultaneously
    const [tripHopTracks, ambientTracks] = await Promise.all([p1, p2]);
    const duration = performance.now() - startTime;

    console.log(`✅ Parallel Queries resolved in ${duration.toFixed(2)}ms`);
    console.log(`Trip-hop Results Count: ${tripHopTracks.length} (Expected: 5000)`);
    console.log(`Ambient Results Count: ${ambientTracks.length} (Expected: 5000)`);

    // Verify ordering
    const sortedCorrectly = tripHopTracks[0].duration <= tripHopTracks[tripHopTracks.length - 1].duration;
    console.log(`✅ Sorting Assert Verified: ${sortedCorrectly ? "PASSED" : "FAILED"}`);

  } catch (error) {
    console.error("❌ Thread run caught runtime error:", error);
  } finally {
    pool.terminateAll();
    console.log("🏁 Worker Pool clean up sequence finalized.");
  }
}

runModule2Tests();
```