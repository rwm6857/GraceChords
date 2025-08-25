// Lightweight tracing helpers for pdf2. This lives alongside the legacy
// engine's own debug utilities.
const ON = () => {
  try { return window?.localStorage?.getItem("pdfPlanTrace") === "1"; } catch { return false; }
};

/**
 * Conditionally record a trace row if debug mode is enabled.
 *
 * @param {Array<object>} rows - Trace buffer to append to.
 * @param {object} row - Row data describing an event.
 */
export const pushTrace = (rows, row) => { if (ON()) rows.push(row); };

/**
 * Emit buffered trace rows to the console when debugging is enabled.
 *
 * @param {string} label - Group label for console output.
 * @param {Array<object>} rows - Trace data collected during planning.
 */
export const flushTrace = (label, rows) => {
  if (ON() && rows.length) {
    console.groupCollapsed(label);
    console.table(rows);
    console.groupEnd();
  }
};
