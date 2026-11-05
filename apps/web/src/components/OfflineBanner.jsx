import React from 'react'
import { useTranslation } from 'react-i18next'

function isOffline(){
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export default function OfflineBanner(){
  const [offline, setOffline] = React.useState(isOffline)
  const { t } = useTranslation('common')

  React.useEffect(() => {
    const update = () => setOffline(isOffline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="gc-offline" role="status">
      <p className="gc-offline__inner">{t('offline')}</p>
    </div>
  )
}
