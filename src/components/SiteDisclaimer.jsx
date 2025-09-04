import React from 'react'
import { getSiteDisclaimer, isDisclaimerEnabled } from '../config/disclaimer'

export default function SiteDisclaimer(){
  if (!isDisclaimerEnabled()) return null
  const text = getSiteDisclaimer()
  return (
    <footer style={{ marginTop: '3rem' }}>
      <div
        style={{
          fontSize: '0.85rem',
          opacity: 0.75,
          textAlign: 'center',
          padding: '1rem',
          borderTop: '1px solid rgba(127,127,127,0.2)',
          maxWidth: 920,
          margin: '0 auto'
        }}
      >
        {text}
      </div>
    </footer>
  )
}

