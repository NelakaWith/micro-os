/**
 * High-Performance Binary Min-Heap Priority Queue.
 * Guarantees O(log N) insertions and O(log N) extractions for system telemetry events.
 * Lower priority numbers are treated as higher priority (e.g. Priority 1 = Critical, Priority 5 = Info).
 */
export class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  /**
   * Inserts an event payload into the heap sorted by numerical priority.
   * Time Complexity: O(log N)
   * @param {*} item - Telemetry event data
   * @param {number} priority - Numeric priority rating (1-5)
   */
  push(item, priority) {
    const node = { item, priority, timestamp: performance.now() };
    this.heap.push(node);
    this._bubbleUp(this.heap.length - 1);
  }

  /**
   * Extracts and returns the highest priority item (minimum priority value) in the queue.
   * Time Complexity: O(log N)
   * @returns {*} Item payload or null if empty
   */
  pop() {
    if (this.isEmpty()) return null;

    const root = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._bubbleDown(0);
    }

    return root.item;
  }

  /**
   * Inspects the highest priority item without removing it.
   * Time Complexity: O(1)
   */
  peek() {
    return this.isEmpty() ? null : this.heap[0].item;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  size() {
    return this.heap.length;
  }

  // =========================================================================
  // Private Binary Heap Bubbling Routines (O(log N))
  // =========================================================================

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].priority >= this.heap[parentIndex].priority) {
        break;
      }
      this._swap(index, parentIndex);
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      const leftIndex = 2 * index + 1;
      const rightIndex = 2 * index + 2;
      let smallestIndex = index;

      if (
        leftIndex < length &&
        this.heap[leftIndex].priority < this.heap[smallestIndex].priority
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < length &&
        this.heap[rightIndex].priority < this.heap[smallestIndex].priority
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === index) break;

      this._swap(index, smallestIndex);
      index = smallestIndex;
    }
  }

  _swap(i, j) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}
