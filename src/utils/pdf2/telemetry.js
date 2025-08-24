const ON = () => {
  try { return window?.localStorage?.getItem("pdfPlanTrace") === "1"; } catch { return false; }
};
export const pushTrace = (rows, row) => { if (ON()) rows.push(row); };
export const flushTrace = (label, rows) => {
  if (ON() && rows.length) {
    console.groupCollapsed(label);
    console.table(rows);
    console.groupEnd();
  }
};
