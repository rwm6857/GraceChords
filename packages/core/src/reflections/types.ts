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
}
