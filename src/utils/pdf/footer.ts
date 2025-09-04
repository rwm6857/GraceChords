import { getPdfFooterDisclaimer, isDisclaimerEnabled } from '../../config/disclaimer'

export function drawPdfFooter(doc: any, layout: { left: number; bottom: number; pageWidth: number; pageHeight: number }){
  if (!isDisclaimerEnabled()) return
  const text = getPdfFooterDisclaimer()
  const fontSize = 8
  try { doc.setFont('helvetica', 'normal') } catch {}
  try { doc.setFontSize(fontSize) } catch {}
  const x = layout.left
  const y = layout.pageHeight - layout.bottom + Math.ceil(fontSize * 0.3)
  try { doc.text(text, x, y, { maxWidth: layout.pageWidth - layout.left * 2 }) } catch {}
}

export function applyFooterToAllPages(doc: any, margins: { left: number; bottom: number }, page: { w: number; h: number }){
  if (!isDisclaimerEnabled()) return
  const n = (typeof doc.getNumberOfPages === 'function') ? doc.getNumberOfPages() : 1
  for (let i = 1; i <= n; i++){
    try { doc.setPage(i) } catch {}
    drawPdfFooter(doc, { left: margins.left, bottom: margins.bottom, pageWidth: page.w, pageHeight: page.h })
  }
}

export default { drawPdfFooter, applyFooterToAllPages }

