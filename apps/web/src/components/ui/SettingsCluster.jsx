import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../../hooks/useSettings'
import { useLocale } from '../../hooks/useLocale'
import { Sun, Moon, GlobeIcon } from '../Icons'

export function PillToggle({
  leftContent,
  rightContent,
  value,
  onChange,
  ariaLabel,
  variant = 'text',
  className = '',
}) {
  const isRight = value === 'right'
  const handleClick = () => onChange(isRight ? 'left' : 'right')
  return (
    <button
      type="button"
      className={`gc-pill-toggle gc-pill-toggle--${variant} ${isRight ? 'is-right' : 'is-left'} ${className}`}
      role="switch"
      aria-checked={isRight}
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      <span className="gc-pill-toggle__track" aria-hidden="true">
        <span className="gc-pill-toggle__thumb" />
        <span className="gc-pill-toggle__option gc-pill-toggle__option--left">{leftContent}</span>
        <span className="gc-pill-toggle__option gc-pill-toggle__option--right">{rightContent}</span>
      </span>
    </button>
  )
}

export function ThemeSwitch({ className }) {
  const { t } = useTranslation('common')
  const { theme, toggleTheme } = useSettings()
  const isDark = theme === 'dark'
  return (
    <PillToggle
      leftContent={<><Sun width={16} height={16} /><span>{t('light')}</span></>}
      rightContent={<><Moon width={16} height={16} /><span>{t('dark')}</span></>}
      value={isDark ? 'right' : 'left'}
      onChange={toggleTheme}
      ariaLabel={t('toggleDarkMode')}
      variant="icon-text"
      className={className}
    />
  )
}

export function ChordStyleSwitch({ className }) {
  const { t } = useTranslation('common')
  const { chordStyle, toggleChordStyle } = useSettings()
  const isSolfege = chordStyle === 'solfege'
  return (
    <PillToggle
      leftContent="ABC"
      rightContent="DoReMi"
      value={isSolfege ? 'right' : 'left'}
      onChange={toggleChordStyle}
      ariaLabel={t('toggleChordStyle', { defaultValue: 'Toggle chord style' })}
      variant="text"
      className={className}
    />
  )
}

export function LocalePicker({ className = '' }) {
  const { language, setLanguage, supportedLocales } = useLocale()
  const { t } = useTranslation('common')
  return (
    <div className={`gc-locale-picker ${className}`}>
      <GlobeIcon className="gc-locale-picker__icon" width={16} height={16} aria-hidden="true" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        aria-label={t('language')}
        className="gc-locale-picker__select"
      >
        {supportedLocales.map(loc => (
          <option key={loc.code} value={loc.code}>{loc.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function SettingsCluster({
  orientation = 'row',
  className = '',
}) {
  const { t } = useTranslation('common')
  return (
    <div
      className={`gc-settings-cluster gc-settings-cluster--${orientation} ${className}`}
      role="group"
      aria-label={t('settings', { defaultValue: 'Settings' })}
    >
      <ThemeSwitch />
      <LocalePicker />
      <ChordStyleSwitch />
    </div>
  )
}
