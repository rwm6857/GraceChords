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

      // A Supabase DB trigger (handle_new_user) fires on every auth.users INSERT,
      // including OAuth sign-ups, and creates the public.users row automatically.
      // The upsert below is a safety net: if the trigger is absent or hasn't run
      // yet, it creates the row; if the row already exists, ignoreDuplicates
      // makes it a no-op so existing data is never overwritten.
      const { error: upsertError } = await supabase.from('users').upsert(
        {
          id: session.user.id,
          email: session.user.email,
          display_name: session.user.user_metadata?.full_name ?? session.user.email,
          role: 'user',
        },
        { onConflict: 'id', ignoreDuplicates: true }
      )

      if (upsertError) {
        // Non-fatal: the user is authenticated; log and proceed.
        console.error('AuthCallback: failed to ensure user row:', upsertError)
      }

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
