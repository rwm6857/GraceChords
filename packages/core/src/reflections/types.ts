// Reflection domain types (DOM-free). A reflection is a private, per-user note
// tied to a calendar day's reading, surfaced on the Daily Word landing and the
// reflection journal. Mirrors public.reflections
// (supabase/migrations/*_create_reflections).

// Deliberately narrowed to the single value clients may read or write: an
// attempt to introduce a non-private reflection is a type error, not a runtime
// decision. The underlying column is a wider text/CHECK domain.
export type ReflectionVisibility = 'private'

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
