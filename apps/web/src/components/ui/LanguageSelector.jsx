import React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '../../hooks/useLocale'

export default function LanguageSelector({ id, className, style, compact = false }) {
  const { language, setLanguage, supportedLocales } = useLocale()
  const { t } = useTranslation('common')

  function onChange(e) {
    setLanguage(e.target.value)
  }

  return (
    <select
      id={id}
      className={className || 'gc-language-selector'}
      style={style}
      value={language}
      onChange={onChange}
      aria-label={t('language')}
      title={compact ? t('language') : undefined}
    >
      {supportedLocales.map(loc => (
        <option key={loc.code} value={loc.code}>{loc.label}</option>
      ))}
    </select>
  )
}
