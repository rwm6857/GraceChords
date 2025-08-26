// Register local Noto fonts with jsPDF by fetching from /public/fonts/*.
// Usage: await registerPdfFonts(doc) BEFORE any setFont("NotoSans", ...).

let registeredOnce = false;

/** join BASE_URL with a relative path safely */
function withBase(rel) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  return `${base}${rel.startsWith("/") ? "" : "/"}${rel}`;
}

async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url} (${res.status})`);
  const blob = await res.blob();
  // Convert Blob → base64 safely (avoids large btoa on arraybuffers)
  const base64 = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(`FileReader failed for ${url}`));
    fr.onload = () => resolve(String(fr.result || "").replace(/^data:.*?;base64,/, ""));
    fr.readAsDataURL(blob);
  });
  return base64;
}

/** Register Noto fonts into this jsPDF instance. Idempotent across calls. */
export async function registerPdfFonts(doc) {
  if (registeredOnce) return;

  // If fonts are already present in this jsPDF build, skip work.
  try {
    const list = typeof doc.getFontList === "function" ? doc.getFontList() : null;
    if (list && list.NotoSans) { registeredOnce = true; return; }
  } catch {}

  const manifest = [
    // [public file, vfsName, family, style]
    ["NotoSans-Regular.ttf",     "NotoSans-Regular.ttf",     "NotoSans",     "normal"],
    ["NotoSans-Bold.ttf",        "NotoSans-Bold.ttf",        "NotoSans",     "bold"],
    ["NotoSans-Italic.ttf",      "NotoSans-Italic.ttf",      "NotoSans",     "italic"],
    ["NotoSans-BoldItalic.ttf",  "NotoSans-BoldItalic.ttf",  "NotoSans",     "bolditalic"],
    ["NotoSansMono-Regular.ttf", "NotoSansMono-Regular.ttf", "NotoSansMono", "normal"],
    ["NotoSansMono-Bold.ttf",    "NotoSansMono-Bold.ttf",    "NotoSansMono", "bold"],
  ];

  for (const [file, vfsName, family, style] of manifest) {
    try {
      const b64 = await fetchAsBase64(withBase(`/fonts/${file}`));
      doc.addFileToVFS(vfsName, b64);
      doc.addFont(vfsName, family, style);
    } catch (e) {
      // Non-fatal: we still have core fonts as fallback.
      // eslint-disable-next-line no-console
      console.warn(`[pdf2/fonts] Failed to load ${file}:`, e?.message || e);
    }
  }

  // Mark as registered so future calls are cheap
  registeredOnce = true;
}
