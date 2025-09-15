import React from 'react'

type Props = {
  title: React.ReactNode
  open?: boolean
  onToggle?: () => void
  children?: React.ReactNode
}

export default function Panel({ title, open = false, onToggle, children }: Props){
  return (
    <div className="gc-panel">
      <div className="gc-panel__header" onClick={onToggle} role="button" aria-expanded={open}>
        <strong>{title}</strong>
        <span aria-hidden>{open ? '–' : '+'}</span>
      </div>
      <div className={["gc-panel__content", open ? 'open' : ''].join(' ')}>
        <div style={{ padding: '10px 12px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

