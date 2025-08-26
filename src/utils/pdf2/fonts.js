// Build-time embedded font registrar for jsPDF (Vite ?inline).
// No network needed. Call `await registerPdfFonts(doc)` before any setFont("NotoSans", ...).

import NotoSansRegular     from "../../assets/fonts/NotoSans-Regular.ttf?inline";
import NotoSansBold        from "../../assets/fonts/NotoSans-Bold.ttf?inline";
import NotoSansItalic      from "../../assets/fonts/NotoSans-Italic.ttf?inline";
import NotoSansBoldItalic  from "../../assets/fonts/NotoSans-BoldItalic.ttf?inline";
import NotoMonoRegular     from "../../assets/fonts/NotoSansMono-Regular.ttf?inline";
import NotoMonoBold        from "../../assets/fonts/NotoSansMono-Bold.ttf?inline";

let registeredOnce = false;

function dataUrlToBase64(dataUrl) {
  return String(dataUrl || "").replace(/^data:.*?;base64,/, "");
}

function fontIsRegistered(doc, family) {
  try {
    const list = typeof doc.getFontList === "function" ? doc.getFontList() : null;
    // Some jsPDF builds return an object keyed by family
    return !!(list && list[family]);
  } catch {
    return false;
  }
}

export async function registerPdfFonts(doc) {
  if (registeredOnce && fontIsRegistered(doc, "NotoSans")) return;

  const manifest = [
    [NotoSansRegular,    "NotoSans-Regular.ttf",     "NotoSans",     "normal"],
    [NotoSansBold,       "NotoSans-Bold.ttf",        "NotoSans",     "bold"],
    [NotoSansItalic,     "NotoSans-Italic.ttf",      "NotoSans",     "italic"],
    [NotoSansBoldItalic, "NotoSans-BoldItalic.ttf",  "NotoSans",     "bolditalic"],
    [NotoMonoRegular,    "NotoSansMono-Regular.ttf", "NotoSansMono", "normal"],
    [NotoMonoBold,       "NotoSansMono-Bold.ttf",    "NotoSansMono", "bold"],
  ];

  for (const [dataUrl, vfsName, family, style] of manifest) {
    const b64 = dataUrlToBase64(dataUrl);
    doc.addFileToVFS(vfsName, b64);
    doc.addFont(vfsName, family, style);
  }

  registeredOnce = true;
}

/** Convenience: set font with fallback to core fonts without throwing */
export function safeSetFont(doc, family, style) {
  try { doc.setFont(family, style); return true; } catch {}
  try { doc.setFont(style?.includes("mono") ? "Courier" : "Helvetica", style.includes("bold") ? "bold" : "normal"); } catch {}
  return false;
}
