import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../../hooks/useSettings'
import { useLocale } from '../../hooks/useLocale'

export function PillToggle({
  leftLabel,
  rightLabel,
  value,
  onChange,
  ariaLabel,
  className = '',
}) {
  const isRight = value === 'right'
  const handleClick = () => onChange(isRight ? 'left' : 'right')
  return (
    <button
      type="button"
      className={`gc-pill-toggle ${isRight ? 'is-right' : 'is-left'} ${className}`}
      role="switch"
      aria-checked={isRight}
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      <span className="gc-pill-toggle__track" aria-hidden="true">
        <span className="gc-pill-toggle__thumb" />
        <span className="gc-pill-toggle__option gc-pill-toggle__option--left">{leftLabel}</span>
        <span className="gc-pill-toggle__option gc-pill-toggle__option--right">{rightLabel}</span>
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
      leftLabel={t('light')}
      rightLabel={t('dark')}
      value={isDark ? 'right' : 'left'}
      onChange={toggleTheme}
      ariaLabel={t('toggleDarkMode')}
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
      leftLabel="ABC"
      rightLabel="DoReMi"
      value={isSolfege ? 'right' : 'left'}
      onChange={toggleChordStyle}
      ariaLabel={t('toggleChordStyle', { defaultValue: 'Toggle chord style' })}
      className={className}
    />
  )
}

export function LocalePicker({ className = '' }) {
  const { language, setLanguage, supportedLocales } = useLocale()
  const { t } = useTranslation('common')
  return (
    <div className={`gc-locale-picker ${className}`}>
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
  showLabels = false,
}) {
  const { t } = useTranslation('common')
  return (
    <div
      className={`gc-settings-cluster gc-settings-cluster--${orientation} ${className}`}
      role="group"
      aria-label={t('settings', { defaultValue: 'Settings' })}
    >
      {showLabels ? (
        <>
          <SettingRow label={t('darkMode')}><ThemeSwitch /></SettingRow>
          <SettingRow label={t('language')}><LocalePicker /></SettingRow>
          <SettingRow label={t('chordStyle', { defaultValue: 'Chord style' })}><ChordStyleSwitch /></SettingRow>
        </>
      ) : (
        <>
          <ThemeSwitch />
          <LocalePicker />
          <ChordStyleSwitch />
        </>
      )}
    </div>
  )
}

function SettingRow({ label, children }) {
  return (
    <div className="gc-settings-cluster__row">
      <span className="gc-settings-cluster__label">{label}</span>
      <div className="gc-settings-cluster__control">{children}</div>
    </div>
  )
}
