import React from 'react'

export default function Busy({ busy }) {
  if (!busy) return null
  return (
    <div className="BusyOverlay" role="status" aria-live="polite">
      <div className="Spinner" />
    </div>
  )
}
