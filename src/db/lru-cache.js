/**
 * Represents a Node in our Doubly Linked List for the LRU Cache.
 */
class LRUNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

/**
 * High-Performance Least Recently Used (LRU) Cache
 * Uses a Doubly Linked List + Map to achieve O(1) reads and writes.
 */
export class LRUCache {
  /**
   * @param {number} capacity - Maximum items allowed in the cache.
   */
  constructor(capacity) {
    this.capacity = capacity;

    /** @type {Map<string, LRUNode>} */
    this.map = new Map(); //* key -> LRUNode

    // Setup guard boundaries (dummy nodes) to avoid null-pointer checks during list operations.
    this.head = new LRUNode("__DUMMY_HEAD__", null);
    this.tail = new LRUNode("__DUMMY_HEAD__", null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Retrieve a value from the cache and mark it as most recently used.
   * Time Complexity: O(1)
   * @param {string} key
   * @returns {*} value or null if not found
   */
  get(key) {
    if (!this.map.has(key)) return null;
    const node = this.map.get(key);
    this._moveToHead(node);
    return node.value;
  }

  /**
   * Inserts a key-value pair into the cache or updates an existing key.
   * If the cache exceeds capacity, the Least Recently Used (LRU) item is evicted.
   * Time Complexity: O(1)
   * @param {string} key
   * @param {*} value
   */
  put(key, value) {
    if (this.map.has(key)) {
      const node = this.map.get(key);
      node.value = value;
      this._moveToHead(node);
    } else {
      const newNode = new LRUNode(key, value);
      this.map.set(key, newNode);
      this._addNode(newNode);

      // Handle cache eviction if capacity threshold is exceeded
      if (this.map.size > this.capacity) {
        const lruNode = this.tail.prev;

        // Remove the LRU node from the physical memory list and from the quick-lookup hash Map
        this._removeNode(lruNode);
        this.map.delete(lruNode.key);
      }
    }
  }

  /**
   * Clear all items in the cache.
   */
  clear() {
    this.map.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  // =========================================================================
  // Private Helper Methods (DLL pointer manipulation)
  // =========================================================================

  /**
   * Inserts a node directly after the dummy head (The Most Recently Used location).
   * @private
   * @param {LRUNode} node
   */
  _addNode(node) {
    node.prev = this.head;
    node.next = this.head.next;

    this.head.next.prev = node;
    this.head.next = node;
  }

  /**
   * Removes an existing node from its current position in the Doubly Linked List.
   * @private
   * @param {LRUNode} node
   */
  _removeNode(node) {
    const prevNode = node.prev;
    const nextNode = node.next;

    prevNode.next = nextNode;
    nextNode.prev = prevNode;
  }

  /**
   * Detaches a node from its current spot and repositions it at the head of the list.
   * @private
   * @param {LRUNode} node
   */
  _moveToHead(node) {
    this._removeNode(node);
    this._addNode(node);
  }
}
