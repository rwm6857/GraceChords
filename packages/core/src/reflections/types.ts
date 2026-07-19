// Reflection domain types (DOM-free). A reflection is a private, per-user note
// tied to a calendar day's reading, surfaced on the Daily Word landing and the
// reflection journal. Phase 1 only ever writes visibility = 'private'; the
// 'public' value + content_key are forward-compatible with Phase 2 and unused
// for now. Mirrors public.reflections (supabase/migrations/*_create_reflections).

export type ReflectionVisibility = 'private' | 'public'

export type Reflection = {
  id: string
  user_id: string
  /** Local calendar day the reflection is for, as YYYY-MM-DD. */
  reflection_date: string
  /** Optional link to the day's reading; NULL in Phase 1 (day-of-year keyed). */
  content_key: string | null
  visibility: ReflectionVisibility
  body: string
  created_at: string
  /** Denormalized heart count (public posts; 0 for private). Phase 2. */
  heart_count?: number
  /** Set when moderation soft-deletes a public post; absent/NULL otherwise. */
  removed_at?: string | null
}

// A public feed post as the client is allowed to see it — deliberately WITHOUT
// user_id or any author-identifying field (anonymity). The public feed query
// selects exactly these columns.
export type PublicReflection = {
  id: string
  body: string
  heart_count: number
}
