import { LRUCache } from "./lru-cache.js";
import { DBCommand } from "./db-command.js";

/**
 * Main Core In-Memory Transactional Database Engine.
 * Manages indexed storage, dynamic query resolution via secondary lookup indices,
 * history tracking (Undo/Redo), and ACID-compliant transaction blocks.
 */
export class DatabaseEngine {
  constructor() {
    /** @type {Map<string, object>} Primary Index (id -> deep-cloned record) */
    this.records = new Map();

    /** @type {Map<string, Map<any, Set<string>>>} Secondary Indexes (fieldName -> Map<value, Set<id>>) */
    this.indexes = new Map();

    /** @type {LRUCache} Query caching layer to accelerate identical index scans */
    this.cache = new LRUCache(100);

    // Active transaction boundary metadata
    this.activeTransaction = null;

    // Linear history stacks for operations executed outside transactions
    /** @type {DBCommand[]} */
    this.undoStack = [];
    /** @type {DBCommand[]} */
    this.redoStack = [];
  }

  /**
   * Registers a database field to be indexed dynamically.
   * Promotes filtered queries on this field from O(N) fallback scans to O(1) hash map operations.
   * @param {string} fieldName
   */
  createIndex(fieldName) {
    if (this.indexes.has(fieldName)) return;

    this.indexes.set(fieldName, new Map());

    // Retroactively index all existing datasets
    for (const [id, record] of this.records) {
      this._addIndexEntry(id, record, fieldName);
    }
  }

  /**
   * Inserts a unique record cleanly into the database.
   * @param {object} record - Must contain a unique "id" string.
   */
  insert(record) {
    if (!record || typeof record.id !== "string") {
      throw new Error("Invalid record: A unique 'id' string is required.");
    }
    if (this.records.has(record.id)) {
      throw new Error(
        `Integrity Constraint Violation: Record with ID "${record.id}" already exists.`,
      );
    }

    const command = new DBCommand("INSERT", this, record.id, record);
    this._executeCommand(command);
  }

  /**
   * Surgically modifies an existing record.
   * Merges modifications while preventing ID mutations.
   * @param {string} id
   * @param {object} updates
   */
  update(id, updates) {
    const oldRecord = this.records.get(id);
    if (!oldRecord) {
      throw new Error(`Record with ID "${id}" does not exist.`);
    }

    // Safely decouple reference values by making deep copies
    const oldClone = JSON.parse(JSON.stringify(oldRecord));
    const mergedRecord = { ...oldClone, ...updates, id }; // Enforce primary key lock

    const command = new DBCommand("UPDATE", this, id, mergedRecord, oldClone);
    this._executeCommand(command);
  }

  /**
   * Excises a record from the database.
   * @param {string} id
   */
  delete(id) {
    const oldRecord = this.records.get(id);
    if (!oldRecord) {
      throw new Error(`Record with ID "${id}" does not exist.`);
    }

    const oldClone = JSON.parse(JSON.stringify(oldRecord));
    const command = new DBCommand("DELETE", this, id, null, oldClone);
    this._executeCommand(command);
  }

  /**
   * Search database records by an indexed field or a fallback linear scan.
   * Time Complexity: O(1) (with active index) or O(N) (fallback table scan).
   * @param {string} fieldName
   * @param {*} value
   * @returns {object[]} Array of matched record clones to preserve read encapsulation.
   */
  query(fieldName, value) {
    // 1. Check if we have an immediate match inside our LRU Cache
    const cacheKey = `${fieldName}:${JSON.stringify(value)}`;
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult !== null) {
      return JSON.parse(JSON.stringify(cachedResult));
    }

    let results = [];
    const fieldIndexMap = this.indexes.get(fieldName);

    if (fieldIndexMap) {
      // 2. High-Performance Index Path: O(1) matching ID retrieval
      const idSet = fieldIndexMap.get(value);
      if (idSet) {
        idSet.forEach((id) => {
          const item = this.records.get(id);
          if (item) {
            results.push(JSON.parse(JSON.stringify(item)));
          }
        });
      }
    } else {
      // 3. Fallback Path: O(N) full sequence scan
      for (const record of this.records.values()) {
        if (record[fieldName] === value) {
          results.push(JSON.parse(JSON.stringify(record)));
        }
      }
    }

    // 4. Cache the findings for performance on repeated queries
    this.cache.put(cacheKey, results);
    return JSON.parse(JSON.stringify(results));
  }

  // =========================================================================
  // ACID Transaction Isolation Layer
  // =========================================================================

  /**
   * Opens an isolated database transactional context.
   * Changes made inside are staged, ready to commit or rollback.
   */
  beginTransaction() {
    if (this.activeTransaction) {
      throw new Error(
        "Active Transaction Present: Nested transactions are not supported.",
      );
    }

    this.activeTransaction = {
      snapshots: new Map(), // Original values of modified records (id -> original state clone)
      newIds: new Set(), // Tracks records inserted in this transaction frame
      deletedIds: new Map(), // Keeps historical clones of elements deleted during this transaction
    };
  }

  /**
   * Commit all active mutations.
   * Finalizes staged operations and discards tracking logs safely.
   */
  commit() {
    if (!this.activeTransaction) {
      throw new Error("Transaction Fault: No active transaction to commit.");
    }

    this.activeTransaction = null;
    this.cache.clear(); // Flush cache to keep data queries in sync
  }

  /**
   * Rollback all active transactional modifications.
   * Surgically reverts states to exactly match the pre-transaction frame.
   */
  rollback() {
    if (!this.activeTransaction) {
      throw new Error("Transaction Fault: No active transaction to roll back.");
    }

    const tx = this.activeTransaction;

    // 1. Purge all items initialized within this transactional boundary
    for (const id of tx.newIds) {
      this._directDelete(id);
    }

    // 2. Roll back all modified records to their pre-transaction snapshots
    for (const [id, originalValue] of tx.snapshots) {
      this._directUpdate(id, originalValue);
    }

    // 3. Resurrect all deleted records using pre-transaction clones
    for (const [id, originalValue] of tx.deletedIds) {
      this._directInsert(id, originalValue);
    }

    this.activeTransaction = null;
    this.cache.clear();
  }

  // =========================================================================
  // Command Execution & Linear History Management
  // =========================================================================

  /**
   * Executes a command. If inside a transaction, snapshots states to allow rollbacks.
   * If running outside a transaction, adds commands directly to the linear undo stacks.
   * @private
   * @param {DBCommand} command
   */
  _executeCommand(command) {
    if (this.activeTransaction) {
      const tx = this.activeTransaction;
      const id = command.id;

      if (command.type === "INSERT") {
        tx.newIds.add(id);
      } else if (command.type === "UPDATE") {
        // Core Isolation: Snapshot ONLY the *first* state prior to transactional updates.
        if (!tx.snapshots.has(id) && !tx.newIds.has(id)) {
          tx.snapshots.set(
            id,
            JSON.parse(JSON.stringify(this.records.get(id))),
          );
        }
      } else if (command.type === "DELETE") {
        if (tx.newIds.has(id)) {
          // If deleted an item created in this transaction, clear trace of its birth.
          tx.newIds.delete(id);
        } else {
          // If delete was performed on an already modified item, move snapshot to deletion list.
          if (tx.snapshots.has(id)) {
            tx.deletedIds.set(id, tx.snapshots.get(id));
            tx.snapshots.delete(id);
          } else if (!tx.deletedIds.has(id)) {
            tx.deletedIds.set(
              id,
              JSON.parse(JSON.stringify(this.records.get(id))),
            );
          }
        }
      }
    }

    command.execute();
    this.cache.clear();

    // If running outside transactions, track execution in global command history
    if (!this.activeTransaction) {
      this.undoStack.push(command);
      this.redoStack = []; // Clear redo pipeline on fresh operations
    }
  }

  /**
   * Pulls the last command off the stack and executes its inverse action.
   */
  undo() {
    if (this.activeTransaction) {
      throw new Error(
        "History Fault: Cannot perform Undo operations inside an active transaction.",
      );
    }

    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      this.cache.clear();
    }
  }

  /**
   * Takes the last reverted command off the redo stack and re-runs its execute pipeline.
   */
  redo() {
    if (this.activeTransaction) {
      throw new Error(
        "History Fault: Cannot perform Redo operations inside an active transaction.",
      );
    }

    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
      this.cache.clear();
    }
  }

  // =========================================================================
  // Private In-Place Index and Record Mutator Routines
  // =========================================================================

  _directInsert(id, record) {
    const recordClone = JSON.parse(JSON.stringify(record));
    this.records.set(id, recordClone);

    // Dynamically expand index map configurations
    for (const fieldName of this.indexes.keys()) {
      this._addIndexEntry(id, recordClone, fieldName);
    }
  }

  _directUpdate(id, record) {
    const recordClone = JSON.parse(JSON.stringify(record));
    const oldRecord = this.records.get(id);

    for (const fieldName of this.indexes.keys()) {
      if (oldRecord) this._removeIndexEntry(id, oldRecord, fieldName);
      this._addIndexEntry(id, recordClone, fieldName);
    }

    this.records.set(id, recordClone);
  }

  _directDelete(id) {
    const oldRecord = this.records.get(id);
    if (oldRecord) {
      for (const fieldName of this.indexes.keys()) {
        this._removeIndexEntry(id, oldRecord, fieldName);
      }
    }
    this.records.delete(id);
  }

  // =========================================================================
  // Dynamic Index Helpers
  // =========================================================================

  _addIndexEntry(id, record, fieldName) {
    const fieldValue = record[fieldName];
    if (fieldValue === undefined) return;

    const fieldIndex = this.indexes.get(fieldName);
    if (!fieldIndex.has(fieldValue)) {
      fieldIndex.set(fieldValue, new Set());
    }
    fieldIndex.get(fieldValue).add(id);
  }

  _removeIndexEntry(id, record, fieldName) {
    const fieldValue = record[fieldName];
    if (fieldValue === undefined) return;

    const fieldIndex = this.indexes.get(fieldName);
    if (fieldIndex.has(fieldValue)) {
      const idSet = fieldIndex.get(fieldValue);
      idSet.delete(id);
      if (idSet.size === 0) {
        fieldIndex.delete(fieldValue);
      }
    }
  }
}
