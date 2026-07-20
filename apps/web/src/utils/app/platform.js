// Minimal client-side platform detection (user-agent based). Used by the
// session follower's "open in app" banner to show the nudge only on mobile, and
// nowhere else in the app relies on precise OS detection. Kept intentionally
// small — UA sniffing is best-effort, not authoritative.

function ua() {
  try {
    return (navigator && navigator.userAgent) || ''
  } catch {
    return ''
  }
}

export function isIOS() {
  const s = ua()
  // iPadOS 13+ reports as Macintosh but is touch-capable; include that case.
  return /iPad|iPhone|iPod/.test(s) || (/Macintosh/.test(s) && typeof document !== 'undefined' && 'ontouchend' in document)
}

export function isAndroid() {
  return /Android/.test(ua())
}

export function isMobile() {
  return isIOS() || isAndroid()
}
