// Cookie-backed storage adapter for the Supabase auth client.
//
// By default supabase-js persists the session in localStorage, which is
// isolated per-origin — so a login on gracechords.com is invisible to
// tracks.gracechords.com and vice-versa. Storing the session in a cookie
// scoped to the parent domain (`.gracechords.com`) instead makes it visible to
// every subdomain, giving single sign-on across both sites (and shared
// sign-out). Supabase sessions can exceed the ~4KB per-cookie limit, so values
// are split across numbered chunk cookies and reassembled on read.
//
// IMPORTANT: this file must stay byte-for-byte equivalent in the GraceTracks
// repo (src/lib/cookieStorage.js). Both apps share the Supabase project ref, so
// they derive the same default storage key and read the same cookie.
//
// Security note: like localStorage, these cookies are readable by page JS
// (not httpOnly) — there is no shared backend to issue httpOnly cookies for a
// pure SPA, so this is the same exposure as the previous localStorage setup.

const MAX_CHUNK = 3000 // chars per cookie, comfortably under the ~4KB limit
const COOKIE_DAYS = 400 // browsers cap persistent cookies near this

const hasDocument = typeof document !== 'undefined'

function parentDomainAttr() {
  if (typeof location === 'undefined') return ''
  // Only pin to the shared parent domain on gracechords.com hosts; on localhost
  // / preview deploys fall back to a host-only cookie so dev still works.
  return /(^|\.)gracechords\.com$/.test(location.hostname) ? '; domain=.gracechords.com' : ''
}

function secureAttr() {
  if (typeof location === 'undefined') return ''
  return location.protocol === 'https:' ? '; Secure' : ''
}

function writeCookie(name, value) {
  const maxAge = COOKIE_DAYS * 24 * 60 * 60
  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/${parentDomainAttr()}` +
    `; max-age=${maxAge}; SameSite=Lax${secureAttr()}`
}

function deleteCookie(name) {
  document.cookie =
    `${name}=; path=/${parentDomainAttr()}; max-age=0; SameSite=Lax${secureAttr()}`
}

function readAllCookies() {
  const out = {}
  if (!hasDocument || !document.cookie) return out
  for (const part of document.cookie.split('; ')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1))
  }
  return out
}

export const cookieStorage = {
  getItem(key) {
    const all = readAllCookies()
    if (all[`${key}.0`] !== undefined) {
      let i = 0
      let value = ''
      while (all[`${key}.${i}`] !== undefined) {
        value += all[`${key}.${i}`]
        i++
      }
      return value
    }
    return all[key] ?? null
  },

  setItem(key, value) {
    if (!hasDocument) return
    // Clear any previous representation (single ⇄ chunked) before writing.
    this.removeItem(key)
    if (value.length <= MAX_CHUNK) {
      writeCookie(key, value)
      return
    }
    const chunks = Math.ceil(value.length / MAX_CHUNK)
    for (let i = 0; i < chunks; i++) {
      writeCookie(`${key}.${i}`, value.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK))
    }
  },

  removeItem(key) {
    if (!hasDocument) return
    const all = readAllCookies()
    deleteCookie(key)
    let i = 0
    while (all[`${key}.${i}`] !== undefined) {
      deleteCookie(`${key}.${i}`)
      i++
    }
  },
}
