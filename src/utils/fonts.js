export async function ensureFontsEmbedded(){
  // Optional: embed TTFs here if you add them to /public/fonts and add to jsPDF VFS.
  return { lyricFamily: 'Helvetica', chordFamily: 'Courier' }
}
