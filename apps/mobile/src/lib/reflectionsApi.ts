import { apiPost } from './api'
import { mapSubmitResult, type PublicSubmitResult } from './reflectionsApiMap'

// Thin wrappers over the 2A moderated endpoints. Public reflections are NEVER a
// direct client insert — they go through POST /api/reflections/submit (service
// role + moderation). apiPost attaches the bearer token; we parse the body once
// and map status codes (via the pure mapSubmitResult) to a discriminated result
// the compose screen turns into friendly, retry-able messages. No non-`posted`
// outcome leaves a row.

export type { PublicSubmitResult } from './reflectionsApiMap'

/**
 * Submit a public reflection for moderation. Resolves to a discriminated result;
 * throws only on unexpected transport/auth responses (caller shows a generic retry).
 */
export async function submitPublicReflection(input: {
  body: string
  reflectionDate: string
}): Promise<PublicSubmitResult> {
  const res = await apiPost('/api/reflections/submit', {
    body: input.body,
    reflection_date: input.reflectionDate,
  })
  const body = (await res.json().catch(() => null)) as
    | { allowed?: boolean; id?: string; reasons?: string[]; error?: string }
    | null

  const mapped = mapSubmitResult(res.status, body)
  if (mapped) return mapped
  throw new Error(body?.error || `reflection_submit_failed_${res.status}`)
}

/** Report a public reflection; fires the 2A admin Telegram alert server-side. */
export async function reportReflection(input: {
  reflectionId: string
  reason?: string
}): Promise<void> {
  const res = await apiPost('/api/reflections/report', {
    reflection_id: input.reflectionId,
    reason: input.reason,
  })
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  throw new Error(body?.error || `reflection_report_failed_${res.status}`)
}
