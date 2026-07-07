# Module 1: The Core In-Memory Engine (Workbook Edition)

This module is your hands-on laboratory to rebuild your low-level JavaScript memory and algorithmic instincts. Below, you will find the architectural blueprint, structural skeletons with deep algorithmic requirements, and a self-executing verification test suite.

Your goal is to implement these classes in pure ES6 vanilla JavaScript with **zero external dependencies**.

## 1. Architectural Deep-Dive & Mental Model

In framework development (like React), state transitions are handled by returning new references (immutability). In database development, we leverage **controlled mutability with surgical transaction logging**.

```
   ┌─────────────────────────────────────────────────────────────┐
   │                       Database Class                        │
   │                                                             │
   │   ┌───────────────────┐               ┌─────────────────┐   │
   │   │  Primary Index    │               │Secondary Indexes│   │
   │   │  Map(id => Record)│               │Map(prop=>ValSet)│   │
   │   └─────────▲─────────┘               └────────▲────────┘   │
   │             │                                  │            │
   │             ├─────────────────┬────────────────┘            │
   │             │                 │                             │
   │     ┌───────┴───────┐   ┌─────┴────────┐                    │
   │     │  Active Trans │   │  Undo/Redo   │                    │
   │     │  Snapshots    │   │  Command     │                    │
   │     │  Map(id=>Orig)│   │  History     │                    │
   │     └───────────────┘   └──────────────┘                    │
   └─────────────────────────────────────────────────────────────┘
```

### Architectural Constraints to Keep in Mind:

1. **O(1) Searches:** Queries on indexed properties must avoid linear loops (`for` loops or array filters). They must pull directly from the index.
2. **Reference Decoupling:** Users must never get direct references to database master records. You must clone records going in and out to prevent consumer-side pollution.
3. **Pointers for LRU:** An array-based LRU Cache is too slow ($O(N)$) for system design. You must implement physical pointer manipulation on a Doubly-Linked List to achieve true $O(1)$ operations.

## 2. Implementation Blueprint (Skeletons & Hand-offs)

Create your implementation file and fill out the operations within these class definitions.

```jsx
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
class LRUCache {
  /**
   * @param {number} capacity - Maximum items allowed in the cache.
   */
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map(); // key -> LRUNode
    this.head = new LRUNode(null, null); // Dummy head boundary
    this.tail = new LRUNode(null, null); // Dummy tail boundary
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
    // TODO:
    // 1. Check if key exists in the map. If not, return null.
    // 2. Retrieve the node.
    // 3. Move the node to the head of the list (most recently used).
    // 4. Return the node's value.
  }

  /**
   * Insert or update a value in the cache. Evicts the LRU item if capacity is exceeded.
   * Time Complexity: O(1)
   * @param {string} key
   * @param {*} value
   */
  put(key, value) {
    // TODO:
    // 1. If key already exists:
    //    a. Get the node, update its value.
    //    b. Move it to the head.
    // 2. If key is new:
    //    a. Instantiate a new LRUNode.
    //    b. Add to map and insert it immediately after the dummy head.
    //    c. If map size exceeds capacity:
    //       - Find the least recently used node (located right before the dummy tail).
    //       - Remove it from the list.
    //       - Delete its key from the lookup map.
  }

  /**
   * Clear all items in the cache.
   */
  clear() {
    // TODO: Reset the map and re-link dummy head and tail.
  }

  // --- Private Linked List Pointer Manipulations (O(1)) ---

  _addNode(node) {
    // TODO: Insert a node directly after the dummy head node.
  }

  _removeNode(node) {
    // TODO: Sever a node's prev and next connections to excise it from the list.
  }

  _moveToHead(node) {
    // TODO: Combine remove and add helper routines to make a node "most recent".
  }
}

/**
 * Command Pattern: Encapsulates atomic mutations for transaction rollback and undo/redo histories.
 */
class DBCommand {
  /**
   * @param {'INSERT' | 'UPDATE' | 'DELETE'} type
   * @param {DatabaseEngine} db
   * @param {string} id
   * @param {object} [newData] - Decoupled state clone
   * @param {object} [oldData] - Decoupled state clone
   */
  constructor(type, db, id, newData = null, oldData = null) {
    this.type = type;
    this.db = db;
    this.id = id;
    this.newData = newData;
    this.oldData = oldData;
  }

  /**
   * Execute the underlying database mutation directly on the primary & secondary indexes.
   */
  execute() {
    // TODO:
    // Invoke appropriate private database methods based on command type:
    // 'INSERT' -> db._directInsert(id, newData)
    // 'UPDATE' -> db._directUpdate(id, newData)
    // 'DELETE' -> db._directDelete(id)
  }

  /**
   * Revert the exact mutation performed by execute().
   */
  undo() {
    // TODO:
    // Perform inverse actions based on command type:
    // 'INSERT' -> Revert by deleting the record.
    // 'UPDATE' -> Revert by restoring oldData.
    // 'DELETE' -> Revert by inserting oldData.
  }
}

/**
 * Main Core In-Memory Transactional Database Engine
 */
class DatabaseEngine {
  constructor() {
    this.records = new Map(); // Primary Index (id -> cloned record)
    this.indexes = new Map(); // Secondary Indexes (fieldName -> Map<value, Set<id>>)
    this.cache = new LRUCache(100); // LRU Cache layer

    // Session-level transaction tracking
    this.activeTransaction = null;

    // Command History Stacks
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Register a field to be indexed dynamically.
   * @param {string} fieldName
   */
  createIndex(fieldName) {
    // TODO:
    // 1. If indexes doesn't have fieldName, initialize it with an empty Map.
    // 2. Iterate through existing database records and index them retroactively.
  }

  /**
   * Insert a record safely.
   * @param {object} record - Must contain an 'id' string.
   */
  insert(record) {
    // TODO:
    // 1. Validate 'id' field existence and make sure ID is unique in primary records.
    // 2. Instantiate and execute an 'INSERT' command.
  }

  /**
   * Update an existing record surgically.
   * @param {string} id
   * @param {object} updates
   */
  update(id, updates) {
    // TODO:
    // 1. Get the current master record. Throw if not found.
    // 2. Deep clone the current record state.
    // 3. Compute merged state (maintain the exact original ID).
    // 4. Instantiate and execute an 'UPDATE' command.
  }

  /**
   * Delete an existing record.
   * @param {string} id
   */
  delete(id) {
    // TODO:
    // 1. Get the current master record. Throw if not found.
    // 2. Deep clone state.
    // 3. Instantiate and execute a 'DELETE' command.
  }

  /**
   * Search records using indexed paths (O(1)) or fallback scans.
   * @param {string} fieldName
   * @param {*} value
   * @returns {object[]} matched records (deep-cloned to protect database state)
   */
  query(fieldName, value) {
    // TODO:
    // 1. Generate unique cache key (e.g., "fieldName:JSON.stringify(value)").
    // 2. Hit the LRU cache. If found, return the cloned cached array.
    // 3. Search logic:
    //    a. If a secondary index exists on fieldName:
    //       - Do a map lookup to find the Set of matched IDs.
    //       - Map those IDs back to records in O(1) time.
    //    b. Else (Fallback scan):
    //       - Loop through all values in the records Map and filter matching entries.
    // 4. Decouple/Deep-clone results before saving to cache and returning to the caller.
  }

  // --- ACID Transaction Core Methods ---

  beginTransaction() {
    // TODO:
    // 1. Throw if nested transactions are attempted.
    // 2. Initialize activeTransaction tracking object with:
    //    - snapshots: Map of ID -> original record clone (for modifications)
    //    - newIds: Set of IDs introduced during transaction (for rollback deletion)
    //    - deletedIds: Map of ID -> original record clone (for rollback restoration)
  }

  commit() {
    // TODO: Validate active transaction, clear activeTransaction metadata, clear cache.
  }

  rollback() {
    // TODO:
    // 1. Validate active transaction.
    // 2. Delete all records added during transaction (tx.newIds).
    // 3. Restore all modified records using pre-transaction clones (tx.snapshots).
    // 4. Restore all deleted records using pre-transaction clones (tx.deletedIds).
    // 5. Clear active transaction metadata and cache.
  }

  // --- Command Invocation and Undo/Redo Engine ---

  _executeCommand(command) {
    // TODO:
    // 1. If an active transaction exists:
    //    a. Record insertion, deletion, or pre-modification states within transaction logs.
    //       - Be careful: Only snapshot the *first* state of an element within a transaction.
    // 2. Run command.execute().
    // 3. Invalidate/clear the query cache.
    // 4. If NO transaction is active:
    //    - Push command onto undoStack.
    //    - Reset the redoStack.
  }

  undo() {
    // TODO: Throw if inside an active transaction. Pop from undoStack, run undo(), push to redoStack, clear cache.
  }

  redo() {
    // TODO: Throw if inside an active transaction. Pop from redoStack, run execute(), push to undoStack, clear cache.
  }

  // --- Low-Level Direct Mutations (Under the Hood) ---

  _directInsert(id, record) {
    // TODO: Clone record and write it to the primary Map. Track dynamic secondary indexes.
  }

  _directUpdate(id, record) {
    // TODO: Clone record. Correct outdated index pointers. Update the primary Map.
  }

  _directDelete(id) {
    // TODO: Clean up index pointers from secondary indexes, then remove from primary Map.
  }

  // --- Index Tracking Mechanics ---

  _addIndexEntry(id, record, fieldName) {
    // TODO: Add record's ID to secondary indexes: Map<fieldName, Map<value, Set<id>>>
  }

  _removeIndexEntry(id, record, fieldName) {
    // TODO: Clean up ID references from indexes when elements are modified or deleted.
  }
}
```

## 3. Self-Executing Test & Verification Suite

Once you finish implementing your classes above, paste this test script directly below your code in any console (or run via Node.js). It acts as an automated regression suite to prove your "Lead Edition" engine works!

```
// Verification Runner
(function runVerification() {
  console.log("🚀 Starting DatabaseEngine Verification...");
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

  try {
    // 1. Test Base operations
    const db = new DatabaseEngine();
    db.insert({ id: "t1", title: "Sour Times", genre: "Trip-hop" });
    assert(db.records.has("t1"), "Primary store contains inserted record");

    const query1 = db.query("genre", "Trip-hop");
    assert(query1.length === 1 && query1[0].title === "Sour Times", "Fallback search returns target item");

    // Decoupling verification
    query1[0].title = "Malicious Injection";
    assert(db.records.get("t1").title === "Sour Times", "Returned queried record is deep-cloned and safe");

    // 2. Test Secondary Index (O(1) lookups)
    db.createIndex("genre");
    db.insert({ id: "t2", title: "Glory Box", genre: "Trip-hop" });

    // Verify indexing pointers
    const indexMap = db.indexes.get("genre");
    assert(indexMap && indexMap.get("Trip-hop").has("t2"), "Secondary indexes populate automatically upon insert");

    const query2 = db.query("genre", "Trip-hop");
    assert(query2.length === 2, "Index queries resolve fast and collect complete matching keys");

    // 3. Test LRU Cache Integration
    const cacheKey = "genre:\"Trip-hop\"";
    assert(db.cache.get(cacheKey) !== null, "LRU cache holds query results");

    db.update("t2", { title: "Glory Box (Edited)" });
    assert(db.cache.get(cacheKey) === null, "LRU cache auto-invalidates on database mutations");

    // 4. Test Undo / Redo mechanics
    db.undo(); // Undo the update on t2
    assert(db.records.get("t2").title === "Glory Box", "Command History: Undo restores historical states cleanly");

    db.redo(); // Redo update
    assert(db.records.get("t2").title === "Glory Box (Edited)", "Command History: Redo re-runs historical commands");

    // 5. Test ACID Transaction Mechanics
    db.beginTransaction();
    db.insert({ id: "t3", title: "Over", genre: "Trip-hop" });
    db.update("t1", { title: "Sour Times (Live)" });
    db.delete("t2");

    assert(db.records.has("t3") && db.records.get("t1").title === "Sour Times (Live)", "Active mutations work inside transaction");

    // Rollback
    db.rollback();
    assert(!db.records.has("t3"), "Rollback: Newly inserted elements are successfully purged");
    assert(db.records.get("t1").title === "Sour Times", "Rollback: Updated records revert to snapshotted state");
    assert(db.records.has("t2"), "Rollback: Deleted records are safely restored");

    // 6. LRU Capacity Check
    const lru = new LRUCache(2);
    lru.put("a", 1);
    lru.put("b", 2);
    lru.get("a"); // Access 'a', making 'b' the LRU
    lru.put("c", 3); // Over-capacity, should evict 'b'
    assert(lru.get("b") === null, "LRU Cache: Evicts least-recently-used item properly");
    assert(lru.get("a") === 1 && lru.get("c") === 3, "LRU Cache: Maintains active values within capacity limitations");

    console.log(`\n🎉 Verification Complete: Passed ${passed}/${total} assertions.`);
  } catch (error) {
    console.error("💥 Execution halted with runtime error:", error);
  }
})();
```