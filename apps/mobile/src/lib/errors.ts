// Supabase errors are plain objects ({ message, details, hint, code }), not Error
// instances — so `String(err)` yields "[object Object]". Extract a readable
// message across Error instances, Supabase error objects, and strings.
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}
