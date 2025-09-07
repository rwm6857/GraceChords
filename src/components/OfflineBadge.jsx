import React from 'react'

export default function OfflineBadge(){
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(() => {
          if (!cancelled) setReady(true)
        })
      }
    } catch {}
    return () => { cancelled = true }
  }, [])
  if (!ready) return null
  return (
    <span className="badge" title="Cached for offline use" style={{ background:'#d1fae5', color:'#065f46' }}>
      Available offline
    </span>
  )
}

