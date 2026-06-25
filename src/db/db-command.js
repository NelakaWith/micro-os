/**
 * Command Pattern: Encapsulates atomic mutations for transaction rollback and undo/redo histories.
 */
export class DBCommand {
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
