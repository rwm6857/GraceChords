// src/utils/smartPreviewAndShareJPG.ts
//
// Opens the image in a new tab for quick preview AND (on iOS/iPadOS with Web Share)
// triggers the native share sheet so the user can Save Image or Share immediately.
//
// Usage (from your click handler):
//   const blob = await generateJPGBlobSomehow();
//   await smartPreviewAndShareJPG(blob, 'song.jpg');

const isIOSDevice = (): boolean => {
  // Covers iPhone, iPad (including iPadOS with desktop UA), and iPod
  const ua = navigator.userAgent || ''
  const platform = (navigator as any).platform || ''
  const maxTouchPoints = (navigator as any).maxTouchPoints || 0

  const iOSByUA = /iPhone|iPad|iPod/i.test(ua)
  const iPadOSDesktopUA =
    /Macintosh/i.test(ua) && 'ontouchend' in document && maxTouchPoints > 0

  const platformHints =
    /iPhone|iPad|iPod|iPad Simulator|iPhone Simulator/i.test(platform)

  return iOSByUA || iPadOSDesktopUA || platformHints
}

export async function smartPreviewAndShareJPG(
  blob: Blob,
  filename: string = 'image.jpg'
): Promise<void> {
  const url = URL.createObjectURL(blob)

  try {
    // 1) Always open a preview tab immediately (must be within user gesture).
    window.open(url, '_blank', 'noopener,noreferrer')

    // 2) If iOS/iPadOS and Web Share Level 2 (with files) is supported,
    //    trigger the native share sheet as well.
    if (isIOSDevice() && 'share' in navigator) {
      const file = new File([blob], filename, { type: 'image/jpeg' })

      // Some Safari versions require canShare check with files
      const canShareFiles =
        // @ts-ignore
        typeof navigator.canShare === 'function'
          // @ts-ignore
          ? navigator.canShare({ files: [file] })
          : true

      if (canShareFiles) {
        try {
          // @ts-ignore
          await navigator.share({
            title: 'GraceChords Image',
            files: [file],
          })
        } catch (shareErr) {
          // User cancelled or share not allowed—ignore, preview tab already open.
        }
      }
    } else if (!isIOSDevice()) {
      // 3) Non-iOS fallback: try a direct download for desktop/Android.
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  } finally {
    // Revoke URL after short delay to avoid premature revocation.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
