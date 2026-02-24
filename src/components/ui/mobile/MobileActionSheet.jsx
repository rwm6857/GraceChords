import React from 'react'

export default function MobileActionSheet({
  open = false,
  onClose,
  title = 'More',
  children,
  className = '',
}){
  if (!open) return null

  return (
    <div className={`gc-mobile-actionsheet ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="gc-mobile-actionsheet__overlay"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="gc-mobile-actionsheet__panel">
        <div className="gc-mobile-actionsheet__grab" aria-hidden />
        <div className="gc-mobile-actionsheet__head">
          <strong className="gc-mobile-actionsheet__title">{title}</strong>
          <button type="button" className="gc-btn gc-btn--sm" onClick={onClose}>Done</button>
        </div>
        <div className="gc-mobile-actionsheet__body">
          {children}
        </div>
      </div>
    </div>
  )
}
