import React from 'react'
import { useLocation } from 'react-router-dom'
import { getSiteDisclaimer, isDisclaimerEnabled, DISCLAIMER_EMAIL } from '../config/disclaimer'
import { getCopyrightNotice } from '../config/copyright'

export default function SiteDisclaimer(){
  const { pathname, hash } = useLocation()
  const inWorship = (pathname && pathname.startsWith('/worship')) || (hash && hash.includes('/worship'))
  const inReading = (pathname && pathname.startsWith('/reading')) || (hash && hash.includes('/reading'))
  if (inWorship) return null
  if (!isDisclaimerEnabled()) return null
  const text = getSiteDisclaimer()
  const linkText = 'email us'
  const textParts = text.split(linkText)
  const copyright = getCopyrightNotice()
  return (
    <footer style={{ marginTop: inReading ? '1.5rem' : '3rem' }}>
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
        <div>
          {textParts.length === 2 ? (
            <>
              {textParts[0]}
              <a href={`mailto:${DISCLAIMER_EMAIL}`}>{linkText}</a>
              {textParts[1]}
            </>
          ) : (
            text
          )}
        </div>
        <div style={{ height: '1em' }} aria-hidden="true" />
        <div>{copyright}</div>
      </div>
    </footer>
  )
}
