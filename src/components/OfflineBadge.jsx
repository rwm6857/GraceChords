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
    <span
      className="badge"
      title="Offline: app shell, fonts, index, and visited songs are cached. New content updates on next deploy or refresh."
      style={{ background:'#d1fae5', color:'#065f46', fontSize:'11px', padding:'2px 8px' }}
    >
      Available offline
    </span>
  )
}
