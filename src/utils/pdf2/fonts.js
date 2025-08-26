// Robust jsPDF font registrar using Vite ?url (emits hashed asset URLs).
// We fetch those URLs at runtime (same-origin) and convert to base64 ourselves,
// which avoids the atob/dataURL quirks that some jsPDF builds hit.

import NotoSansRegularURL     from "../../assets/fonts/NotoSans-Regular.ttf?url";
import NotoSansBoldURL        from "../../assets/fonts/NotoSans-Bold.ttf?url";
import NotoSansItalicURL      from "../../assets/fonts/NotoSans-Italic.ttf?url";
import NotoSansBoldItalicURL  from "../../assets/fonts/NotoSans-BoldItalic.ttf?url";
import NotoMonoRegularURL     from "../../assets/fonts/NotoSansMono-Regular.ttf?url";
import NotoMonoBoldURL        from "../../assets/fonts/NotoSansMono-Bold.ttf?url";

let registeredOnce = false;

// Fetch the emitted font URL and convert to a clean base64 string.
async function fetchUrlAsBase64(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Font fetch failed: ${url} (${res.status})`);
  const blob = await res.blob();
  // Use FileReader to get a data URL, then strip prefix to yield pure base64.
  const base64 = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(`FileReader failed for ${url}`));
    fr.onload = () => resolve(String(fr.result || "").replace(/^data:.*?;base64,/, ""));
    fr.readAsDataURL(blob);
  });
  return base64;
}

function fontFamilyExists(doc, family) {
  try {
    const list = typeof doc.getFontList === "function" ? doc.getFontList() : null;
    return !!(list && list[family]);
  } catch { return false; }
}

export async function registerPdfFonts(doc) {
  // If we've registered before and jsPDF still sees NotoSans, skip.
  if (registeredOnce && fontFamilyExists(doc, "NotoSans")) return;

  const manifest = [
    [NotoSansRegularURL,    "NotoSans-Regular.ttf",     "NotoSans",     "normal"],
    [NotoSansBoldURL,       "NotoSans-Bold.ttf",        "NotoSans",     "bold"],
    [NotoSansItalicURL,     "NotoSans-Italic.ttf",      "NotoSans",     "italic"],
    [NotoSansBoldItalicURL, "NotoSans-BoldItalic.ttf",  "NotoSans",     "bolditalic"],
    [NotoMonoRegularURL,    "NotoSansMono-Regular.ttf", "NotoSansMono", "normal"],
    [NotoMonoBoldURL,       "NotoSansMono-Bold.ttf",    "NotoSansMono", "bold"],
  ];

  for (const [url, vfsName, family, style] of manifest) {
    try {
      const b64 = await fetchUrlAsBase64(url);
      doc.addFileToVFS(vfsName, b64);
      doc.addFont(vfsName, family, style);
    } catch (e) {
      console.warn(`[pdf2/fonts] Failed to load/register ${vfsName}:`, e?.message || e);
    }
  }

  registeredOnce = true;
}
