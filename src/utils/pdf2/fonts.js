// Lazy-load and register Noto fonts with jsPDF.
// Call registerPdfFonts(doc) once before you set fonts in a document.

let registered = false;

async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
  const blob = await res.blob();
  // Convert to base64 via FileReader to avoid large ArrayBuffer btoa issues
  const base64 = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(`FileReader failed for ${url}`));
    fr.onload = () => {
      const dataUrl = String(fr.result || "");
      resolve(dataUrl.replace(/^data:.*?;base64,/, ""));
    };
    fr.readAsDataURL(blob);
  });
  return base64;
}

export async function registerPdfFonts(doc) {
  if (registered) return;

  const base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  const p = (name) => `${base}/fonts/${name}`;

  // Map font file → [vfsName, family, style]
  const fonts = [
    ["NotoSans-Regular.ttf",      "NotoSans-Regular.ttf",      "NotoSans",     "normal"],
    ["NotoSans-Bold.ttf",         "NotoSans-Bold.ttf",         "NotoSans",     "bold"],
    ["NotoSans-Italic.ttf",       "NotoSans-Italic.ttf",       "NotoSans",     "italic"],
    ["NotoSans-BoldItalic.ttf",   "NotoSans-BoldItalic.ttf",   "NotoSans",     "bolditalic"],

    ["NotoSansMono-Regular.ttf",  "NotoSansMono-Regular.ttf",  "NotoSansMono", "normal"],
    ["NotoSansMono-Bold.ttf",     "NotoSansMono-Bold.ttf",     "NotoSansMono", "bold"],
    // No italic for Mono in your set; jsPDF will fall back to normal if requested.
  ];

  // Fetch and register each TTF
  for (const [file, vfsName, family, style] of fonts) {
    try {
      const b64 = await fetchAsBase64(p(file));
      doc.addFileToVFS(vfsName, b64);
      doc.addFont(vfsName, family, style);
    } catch (e) {
      // Non-fatal: we’ll fall back to core fonts if any are missing
      // eslint-disable-next-line no-console
      console.warn(`[pdf fonts] Failed to load ${file}:`, e?.message || e);
    }
  }

  registered = true;
}
