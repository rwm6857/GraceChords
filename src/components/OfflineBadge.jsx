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
  function onClick(){
    try {
      if (window.innerWidth < 640) {
        alert('Offline: app shell, fonts, index, and visited songs are cached. Updates apply on next deploy or refresh.')
      }
    } catch {}
  }
  return (
    <span
      className="badge"
      onClick={onClick}
      role="button"
      title="Offline: app shell, fonts, index, and visited songs are cached. New content updates on next deploy or refresh."
      style={{
        background:'#d1fae5', color:'#065f46',
        fontSize:'10pt', padding:'2px 6px',
        display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer'
      }}
    >
      <span aria-hidden style={{fontWeight:700}}>✓</span>
      <span className="text-when-wide">Available offline</span>
    </span>
  )
}
