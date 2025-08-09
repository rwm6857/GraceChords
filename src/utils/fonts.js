import { jsPDF } from 'jspdf';

/**
 * Runtime font embedding for jsPDF (graceful fallback).
 * Put TTFs in /public/fonts with these filenames:
 *  - NotoSans-Regular.ttf
 *  - NotoSans-Bold.ttf
 *  - NotoSansMono-Bold.ttf
 */
const DEFAULT_FONTS = {
  lyricRegular: {
    url: `${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`,
    vfsName: 'NotoSans-Regular.ttf',
    post: 'NotoSans', // PostScript name used in doc.setFont(...)
  },
  lyricBold: {
    url: `${import.meta.env.BASE_URL}fonts/NotoSans-Bold.ttf`,
    vfsName: 'NotoSans-Bold.ttf',
    post: 'NotoSans-Bold',
  },
  chordBoldMono: {
    url: `${import.meta.env.BASE_URL}fonts/NotoSansMono-Bold.ttf`,
    vfsName: 'NotoSansMono-Bold.ttf',
    post: 'NotoSansMono-Bold',
  },
};

/**
 * Tries to embed fonts; if unavailable, safely falls back to Helvetica/Courier.
 * @returns {{lyricFamily: string, chordFamily: string}}
 */
export async function ensureFontsEmbedded(doc, custom = {}) {
  const map = { ...DEFAULT_FONTS, ...custom };

  for (const key of Object.keys(map)) {
    const ent = map[key];
    if (!ent?.url) continue;
    try {
      const base64 = await fetchAsBase64(ent.url);
      doc.addFileToVFS(ent.vfsName, base64);
      const style = /Bold/i.test(ent.post) ? 'bold' : 'normal';
      doc.addFont(ent.vfsName, ent.post, style);
    } catch {
      // If a font can’t be fetched (e.g., not uploaded yet), silently fall back.
    }
  }

  return {
    lyricFamily: map.lyricRegular?.post || 'Helvetica',
    chordFamily: map.chordBoldMono?.post || 'Courier',
  };
}

async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const blob = await res.blob();
  return blobToBase64(blob);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]); // strip data: header
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
