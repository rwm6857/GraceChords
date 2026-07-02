import { supabase } from './supabase'

// Shared client for the web app's Pages Functions API (/api/export/song,
// /api/telegram/push).

const base = process.env.EXPO_PUBLIC_API_BASE_URL

export function apiBase(): string {
  if (!base) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_BASE_URL. ' +
        'Copy apps/mobile/.env.example to apps/mobile/.env and fill in the values.',
    )
  }
  return base.replace(/\/$/, '')
}

// POST JSON with the caller's Supabase bearer token. If the configured base
// URL redirects (e.g. apex → www), fetch follows the redirect but converts
// the POST to a GET per spec, and the API answers 405 — so on a redirected
// 405 we retry the POST once against the redirect's final origin.
export async function apiPost(path: string, body: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) throw new Error('not_signed_in')

  const headers = {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
  const payload = JSON.stringify(body)

  let res = await fetch(`${apiBase()}${path}`, { method: 'POST', headers, body: payload })
  if (res.status === 405 && res.url) {
    const finalOrigin = new URL(res.url).origin
    if (finalOrigin !== new URL(apiBase()).origin) {
      res = await fetch(`${finalOrigin}${path}`, { method: 'POST', headers, body: payload })
    }
  }
  return res
}

// Read the API's { error } body into a thrown-Error message, with a
// targeted hint for the redirect case a retry couldn't fix.
export async function apiError(res: Response, fallback: string): Promise<Error> {
  if (res.status === 405) {
    return new Error(
      'The API rejected the request (405) — EXPO_PUBLIC_API_BASE_URL likely points at a ' +
        'redirecting domain. Set it to the canonical one (e.g. https://www.gracechords.com).',
    )
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return new Error(body?.error || `${fallback}_${res.status}`)
}
