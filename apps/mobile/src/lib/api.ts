import { supabase } from './supabase'
import { UserFacingError } from './errors'
import { markSessionError } from './sessionError'
import { FOREGROUND_MS, withRequestBudget } from './requestBudget'

// Shared client for the web app's Pages Functions API (/api/export/song,
// /api/telegram/push).

const base = process.env.EXPO_PUBLIC_API_BASE_URL

// Export and Telegram pushes are foreground work — the user tapped a button and
// is waiting on a sheet or a toast. Without a bound these ran to the ~60 s
// platform default with nothing but a spinner.
const budgetedFetch = withRequestBudget(fetch, () => FOREGROUND_MS)

export function apiBase(): string {
  if (!base) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_BASE_URL. ' +
        'Copy apps/mobile/.env.example to apps/mobile/.env and fill in the values.',
    )
  }
  return base.replace(/\/$/, '')
}

async function authHeader(): Promise<{ Authorization: string }> {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) {
    // Every caller turns this into a "Sign in to export" alert, so it is a
    // visible failure even though it never reached the network.
    markSessionError('api.authHeader')
    throw new Error('not_signed_in')
  }
  return { Authorization: `Bearer ${session.access_token}` }
}

// A CROSS-ORIGIN REDIRECT BREAKS AN AUTHENTICATED REQUEST IN TWO WAYS, and both
// land as a status code we can recognise:
//
//   401 — fetch drops the Authorization header when a redirect crosses origins
//         (www.gracechords.com → gracechords.com are different origins), so the
//         API sees no credentials and answers "Missing bearer token".
//   405 — a 301/302 rewrites POST to GET per spec, and the API rejects the
//         method. (307/308 would preserve it; Cloudflare's apex/www rule is 301.)
//
// Neither is a failure the user can act on and neither is visible in the request
// we issued, so on either status — and only when the response came back from a
// DIFFERENT origin than we aimed at, which is proof a redirect happened — we
// re-issue the original request, method and headers intact, against that final
// origin. Once.
//
// This exists as a backstop, not a strategy: EXPO_PUBLIC_API_BASE_URL should
// name the canonical origin (see .env.example) and then this never fires. It is
// here because the failure it repairs is otherwise invisible — a stripped header
// reads as "not linked" or "not signed in" rather than as a misconfiguration,
// which is exactly how it survived into a shipped build once already.
const REDIRECT_REPAIRABLE = new Set([401, 405])

async function sendRepairingRedirect(path: string, init: RequestInit): Promise<Response> {
  const target = `${apiBase()}${path}`
  const res = await budgetedFetch(target, init)
  if (!REDIRECT_REPAIRABLE.has(res.status) || !res.url) return res
  const finalOrigin = new URL(res.url).origin
  if (finalOrigin === new URL(target).origin) return res
  return budgetedFetch(`${finalOrigin}${path}`, init)
}

/** GET or DELETE with the caller's Supabase bearer token. */
export async function apiRequest(method: 'GET' | 'DELETE', path: string): Promise<Response> {
  return sendRepairingRedirect(path, { method, headers: await authHeader() })
}

/** POST JSON with the caller's Supabase bearer token. */
export async function apiPost(path: string, body: unknown): Promise<Response> {
  return sendRepairingRedirect(path, {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Read the API's { error } body into a thrown-Error message, with a
// targeted hint for the redirect case a retry couldn't fix.
export async function apiError(res: Response, fallback: string): Promise<Error> {
  // The chokepoint for every non-ok Pages Function response — song, songbook and
  // setlist exports, and Telegram pushes. It catches the failures raised inside
  // the Song Viewer and the Performer, which alert raw messages without going
  // through errors.ts and which this change is not allowed to edit.
  markSessionError(`api ${res.status}`)
  if (res.status === 405) {
    // UserFacingError so actionFailureMessage shows this verbatim instead of
    // replacing it with generic copy: it names the exact misconfiguration and the
    // exact fix, and whoever hits it is a developer or a tester on a bad build.
    // Reaching here means sendRepairingRedirect already retried and still got a
    // 405, so the base URL is wrong in a way one redirect hop cannot fix.
    return new UserFacingError(
      'The API rejected the request (405) — EXPO_PUBLIC_API_BASE_URL likely points at a ' +
        'redirecting domain. Set it to the canonical one (e.g. https://gracechords.com).',
    )
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return new Error(body?.error || `${fallback}_${res.status}`)
}
