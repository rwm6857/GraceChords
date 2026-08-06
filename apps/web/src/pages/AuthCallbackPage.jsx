import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    async function handleCallback() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        navigate('/login', { replace: true })
        return
      }

      // The public.users row is created by the handle_new_user() trigger on
      // auth.users, which fires on every INSERT including OAuth sign-ups.
      //
      // There used to be a client-side upsert here as a "safety net". It never
      // worked and could not have: it wrote an `email` column that public.users
      // does not have (so PostgREST rejected every call with PGRST204), and even
      // with a valid payload the table has no INSERT policy, so RLS would have
      // refused the row. It logged an error on every OAuth sign-in and was
      // removed rather than repaired — a fallback that cannot run is worse than
      // none, because it reads like provisioning is covered when it isn't.
      navigate('/', { replace: true })
    }

    handleCallback()
  }, [navigate])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--gc-text-secondary)' }}>Signing you in…</p>
    </div>
  )
}
