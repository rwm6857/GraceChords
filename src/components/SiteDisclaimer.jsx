import React from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isDisclaimerEnabled, DISCLAIMER_EMAIL } from '../config/disclaimer'

export default function SiteDisclaimer(){
  const { t } = useTranslation('common')
  const { pathname, hash } = useLocation()
  const inWorship = (pathname && pathname.startsWith('/worship')) || (hash && hash.includes('/worship'))
  const inReading = (pathname && pathname.startsWith('/reading')) || (hash && hash.includes('/reading'))
  if (inWorship) return null
  if (!isDisclaimerEnabled()) return null
  const year = new Date().getFullYear()
  const base = 2023
  const range = year === base ? `${year}` : `${base}–${year}`
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
          {t('footer.disclaimerBefore')}
          <a href={`mailto:${DISCLAIMER_EMAIL}`}>{t('footer.disclaimerLink')}</a>
          {t('footer.disclaimerAfter')}
        </div>
        <div style={{ height: '1em' }} aria-hidden="true" />
        <div>{t('footer.copyright', { range })}</div>
      </div>
    </footer>
  )
}
