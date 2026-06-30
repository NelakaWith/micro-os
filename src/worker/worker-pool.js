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
    this.workers = []; // Pool of active worker wrappers
    this.taskQueue = []; // Waiting line for tasks when all workers are busy
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

    const blob = new Blob([workerCode], { type: "application/javascript" });
    this.workerBlobUrl = URL.createObjectURL(blob);

    for (let i = 0; i < this.maxWorkers; i++) {
      this.workers.push({
        id: i,
        instance: new Worker(this.workerBlobUrl),
        busy: false,
        activeTaskId: null,
      });
    }

    // Set up message handlers for each worker
    this.workers.forEach((w) => {
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

      this.activeTasks.set(taskId, {
        resolve,
        reject,
        timeoutId,
        queryParams,
        dataset,
      });

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
    const idleWorker = this.workers.find((w) => !w.busy);
    if (!idleWorker) return; // All hardware threads are saturated. Hold in queue.

    const task = this.taskQueue.shift();
    idleWorker.busy = true;
    idleWorker.activeTaskId = task.taskId;

    // Surgical transfer: Passes the ArrayBuffer reference directly with zero copy penalty!
    idleWorker.instance.postMessage(
      {
        taskId: task.taskId,
        queryParams: task.queryParams,
        arrayBuffer: task.arrayBuffer,
      },
      [task.arrayBuffer],
    );

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
    const stalledWorker = this.workers.find((w) => w.activeTaskId === taskId);
    if (stalledWorker) {
      console.warn(
        `⚠️ Query Task ${taskId} timed out. Terminating stalled worker thread...`,
      );

      // 2. Hard kill the stalled background OS-level thread
      stalledWorker.instance.terminate();

      // 3. Re-provision a fresh thread replacement
      stalledWorker.instance = new Worker(this.workerBlobUrl);
      stalledWorker.instance.onmessage = (e) =>
        this._handleWorkerMessage(stalledWorker, e.data);
      stalledWorker.busy = false;
      stalledWorker.activeTaskId = null;
    }

    task.reject(
      new Error(
        "Timeout: Query execution exceeded the allowed processing time.",
      ),
    );
    this._processQueue();
  }

  /**
   * Discards all workers and revokes memory allocation URLs.
   */
  terminateAll() {
    this.workers.forEach((w) => w.instance.terminate());
    this.workers = [];
    this.activeTasks.forEach((task) => clearTimeout(task.timeoutId));
    this.activeTasks.clear();
    this.taskQueue = [];
    if (this.workerBlobUrl) {
      URL.revokeObjectURL(this.workerBlobUrl);
    }
  }
}
