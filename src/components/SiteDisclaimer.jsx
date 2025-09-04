import React from 'react'
import { getSiteDisclaimer, isDisclaimerEnabled } from '../config/disclaimer'
import { getCopyrightNotice } from '../config/copyright'

export default function SiteDisclaimer(){
  if (!isDisclaimerEnabled()) return null
  const text = getSiteDisclaimer()
  const copyright = getCopyrightNotice()
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
        <div>{text}</div>
        <div style={{ height: '1em' }} aria-hidden="true" />
        <div>{copyright}</div>
      </div>
    </footer>
  )
}
