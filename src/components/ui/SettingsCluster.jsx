import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../../hooks/useSettings'
import { useLocale } from '../../hooks/useLocale'
import { Sun, Moon } from '../Icons'

function PillSwitch({
  checked,
  onChange,
  leftContent,
  rightContent,
  ariaLabel,
  className = '',
}) {
  return (
    <button
      type="button"
      className={`gc-pill-switch ${checked ? 'is-right' : 'is-left'} ${className}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
    >
      <span className="gc-pill-switch__track" aria-hidden="true">
        <span className="gc-pill-switch__thumb" />
        <span className="gc-pill-switch__option gc-pill-switch__option--left">{leftContent}</span>
        <span className="gc-pill-switch__option gc-pill-switch__option--right">{rightContent}</span>
      </span>
    </button>
  )
}

export function ThemeSwitch({ className }) {
  const { t } = useTranslation('common')
  const { theme, toggleTheme } = useSettings()
  const isDark = theme === 'dark'
  return (
    <PillSwitch
      checked={isDark}
      onChange={toggleTheme}
      leftContent={<Sun width={14} height={14} />}
      rightContent={<Moon width={14} height={14} />}
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
    <PillSwitch
      checked={isSolfege}
      onChange={toggleChordStyle}
      leftContent={<span className="gc-pill-switch__text">ABC</span>}
      rightContent={<span className="gc-pill-switch__text">Do</span>}
      ariaLabel={t('toggleChordStyle', { defaultValue: 'Toggle chord style' })}
      className={`gc-pill-switch--text ${className || ''}`}
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
      <span className="gc-locale-picker__chev" aria-hidden="true">▾</span>
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
