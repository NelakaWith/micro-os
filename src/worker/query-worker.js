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

    const {
      filterField,
      filterValue,
      sortField,
      sortOrder = "asc",
    } = queryParams;

    // 2. Perform the filtering operations
    let results = dataset.filter((item) => item[filterField] === filterValue);

    // 3. Perform sorting calculations in O(N log N) time
    results.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (typeof valA === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    // 4. Serialize the processed results back into binary
    const resultString = JSON.stringify(results);
    const encodedResults = new TextEncoder().encode(resultString);
    const transferBuffer = encodedResults.buffer;

    // 5. Transfer memory ownership back to the main thread with O(1) complexity
    self.postMessage(
      {
        taskId,
        success: true,
        arrayBuffer: transferBuffer,
      },
      [transferBuffer],
    );
  } catch (error) {
    self.postMessage({
      taskId,
      success: false,
      error: error.message,
    });
  }
};
