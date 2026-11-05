import { isChunkLoadError } from './lazyRoute'

// Crash reports go to our own Pages Function (functions/api/client-error.js),
// which stores them in Supabase's client_errors table. No third-party service.
//
// What is sent is limited to what fixing the bug needs: the error, the page
// PATH (never the query string or hash — auth callbacks carry tokens there),
// the browser's user agent, and the deploy's commit. Never user ids, emails or
// song content. The privacy policy describes exactly this; keep them in step.
const ENDPOINT = '/api/client-error'
const MAX_REPORTS_PER_PAGE = 5
const MAX_STACK = 4000

// Noise that is not a GraceChords bug: browser-extension frames, the benign
// ResizeObserver warning, and cross-origin "Script error." with no detail.
const IGNORE_RE = /ResizeObserver loop|^Script error\.?$|chrome-extension:\/\/|moz-extension:\/\/|safari-(web-)?extension:\/\//i

let sent = 0
const seen = new Set()

function clip(value, max){
  const s = String(value ?? '')
  return s.length > max ? s.slice(0, max) : s
}

export function buildErrorReport(error, extra = {}){
  const name = clip(error?.name || 'Error', 100)
  const message = clip(error?.message ?? error ?? 'Unknown error', 500)
  const stack = clip(error?.stack || '', MAX_STACK)
  return {
    name,
    message,
    stack,
    componentStack: clip(extra.componentStack || '', MAX_STACK),
    source: clip(extra.source || 'unknown', 40),
    path: typeof window !== 'undefined' ? clip(window.location.pathname, 300) : '',
    userAgent: typeof navigator !== 'undefined' ? clip(navigator.userAgent, 300) : '',
    release: clip(typeof __SW_VERSION__ !== 'undefined' ? __SW_VERSION__ : '', 64),
  }
}

export function shouldReport(error, { enabled = import.meta.env.PROD } = {}){
  if (!enabled) return false
  if (sent >= MAX_REPORTS_PER_PAGE) return false
  // lazyRoute/main.jsx already recover from these with a reload.
  if (isChunkLoadError(error)) return false
  const text = `${error?.message ?? error ?? ''}\n${error?.stack || ''}`
  if (IGNORE_RE.test(text)) return false
  return true
}

export function reportError(error, extra = {}){
  try {
    if (!shouldReport(error)) return
    const report = buildErrorReport(error, extra)
    const key = `${report.name}:${report.message}:${report.stack.slice(0, 200)}`
    if (seen.has(key)) return
    seen.add(key)
    sent += 1
    const body = JSON.stringify(report)
    // sendBeacon survives the page unloading right after a crash; fall back to
    // a keepalive fetch where it is missing or refuses the payload.
    const queued = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
    if (!queued && typeof fetch === 'function') {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Reporting must never be the thing that breaks the page.
  }
}

export function installGlobalErrorReporting(){
  if (typeof window === 'undefined') return
  window.addEventListener('error', (event) => {
    reportError(event?.error || event?.message, { source: 'window.onerror' })
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event?.reason, { source: 'unhandledrejection' })
  })
}

// Test hook: the module-level throttle would otherwise leak between tests.
export function __resetErrorReporterForTests(){
  sent = 0
  seen.clear()
}
