/**
 * Encapsulates an atomic database mutation (Command Pattern).
 * This decouples raw state modifications from the database orchestrator,
 * allowing for isolated transactions and unlimited undo/redo histories.
 */
export class DBCommand {
  /**
   * @param {'INSERT' | 'UPDATE' | 'DELETE'} type - The mutation type.
   * @param {*} db - The DatabaseEngine instance (passed dynamically to prevent circular imports).
   * @param {string} id - The primary key of the target record.
   * @param {object} [newData] - The state clone to apply forward.
   * @param {object} [oldData] - The state clone to restore during an undo.
   */
  constructor(type, db, id, newData = null, oldData = null) {
    this.type = type;
    this.db = db;
    this.id = id;

    // Deep-clone references to ensure immutable command history
    this.newData = newData ? JSON.parse(JSON.stringify(newData)) : null;
    this.oldData = oldData ? JSON.parse(JSON.stringify(oldData)) : null;
  }

  /**
   * Executes the forward mutation directly on the engine's primary and secondary indexes.
   * Time Complexity: O(1) (leveraging internal Map mappings)
   */
  execute() {
    switch (this.type) {
      case "INSERT":
        this.db._directInsert(this.id, this.newData);
        break;
      case "UPDATE":
        this.db._directUpdate(this.id, this.newData);
        break;
      case "DELETE":
        this.db._directDelete(this.id);
        break;
      default:
        throw new Error(`Unsupported command type: ${this.type}`);
    }
  }

  /**
   * Reverts the execution, surgically restoring the database state to its exact historical frame.
   * Time Complexity: O(1)
   */
  undo() {
    switch (this.type) {
      case "INSERT":
        // Reversing an insertion means removing the record entirely
        this.db._directDelete(this.id);
        break;
      case "UPDATE":
        // Reversing an update means writing back the pre-mutation state
        this.db._directUpdate(this.id, this.oldData);
        break;
      case "DELETE":
        // Reversing a deletion means re-inserting the cached historical state
        this.db._directInsert(this.id, this.oldData);
        break;
      default:
        throw new Error(`Unsupported command undo type: ${this.type}`);
    }
  }
}
