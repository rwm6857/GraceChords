import { jsPDF } from 'jspdf'

// Default font files (put these TTFs in public/fonts)
const DEFAULT_FONTS = {
  lyricRegular: { url: `${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`, vfsName: 'NotoSans-Regular.ttf', post: 'NotoSans' },
  lyricBold:    { url: `${import.meta.env.BASE_URL}fonts/NotoSans-Bold.ttf`,    vfsName: 'NotoSans-Bold.ttf',    post: 'NotoSans-Bold' },
  chordBoldMono:{ url: `${import.meta.env.BASE_URL}fonts/NotoSansMono-Bold.ttf`,vfsName: 'NotoSansMono-Bold.ttf',post: 'NotoSansMono-Bold' },
};

export async function ensureFontsEmbedded(doc, custom = {}) {
  const map = { ...DEFAULT_FONTS, ...custom };

  for (const key of Object.keys(map)) {
    const { url, vfsName, post } = map[key] || {};
    if (!url) continue;
    try {
      const data = await fetchAsBase64(url);
      doc.addFileToVFS(vfsName, data);
      const style = /Bold/i.test(post) ? 'bold' : 'normal';
      doc.addFont(vfsName, post, style);
    } catch (e) {
      // Swallow errors and let jsPDF fall back to Helvetica/Courier
      // console.warn('Font load failed:', url, e);
    }
  }

  return {
    lyricFamily: (map.lyricRegular?.post) || 'Helvetica',
    chordFamily: (map.chordBoldMono?.post) || 'Courier',
  };
}

async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const blob = await res.blob();
  return await blobToBase64(blob);
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
