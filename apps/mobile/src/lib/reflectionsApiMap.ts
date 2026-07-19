// Pure status→result mapping for the public-reflection submit endpoint. Split
// out (no supabase/native imports) so it unit-tests headless. submitPublicReflection
// parses the response body once and delegates here.

export type PublicSubmitResult =
  | { status: 'posted'; id: string }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'already_posted' }
  | { status: 'disabled' }
  | { status: 'banned' }
  | { status: 'unavailable' }

/**
 * Map an HTTP status + parsed JSON body to a domain result, or null when the
 * response is unexpected (the caller then throws a generic error).
 */
export function mapSubmitResult(
  httpStatus: number,
  body: { allowed?: boolean; id?: string; reasons?: string[]; error?: string } | null,
): PublicSubmitResult | null {
  if (httpStatus === 409) return { status: 'already_posted' }
  if (httpStatus === 503) return { status: 'unavailable' }
  if (httpStatus === 403) return body?.error === 'banned' ? { status: 'banned' } : { status: 'disabled' }
  if (httpStatus >= 200 && httpStatus < 300) {
    if (body?.allowed === false) {
      return { status: 'rejected', reasons: Array.isArray(body.reasons) ? body.reasons : [] }
    }
    if (body?.allowed === true && typeof body.id === 'string') {
      return { status: 'posted', id: body.id }
    }
  }
  return null
}
