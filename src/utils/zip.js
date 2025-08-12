export async function downloadZip(files, opts = {}) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const f of files || []) {
    if (!f || !f.path) continue
    zip.file(f.path, f.content)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = opts.name || 'download.zip'
  a.click()
  URL.revokeObjectURL(a.href)
}
