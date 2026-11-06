import React from 'react'
import { useTranslation } from 'react-i18next'
import { PASSWORD_POLICY, checkPassword } from '@gracechords/core'

// The rules themselves live in @gracechords/core so this list, the mobile
// requirement line and both validators cannot drift apart — see
// packages/core/src/auth/passwordPolicy.ts. Only the labels are local
// (auth.json → passwordRules).
const PW_REQUIREMENTS = ['minLength', 'hasLower', 'hasUpper', 'hasDigit', 'hasSymbol']

export { checkPassword }

function CircleIcon({ filled }) {
  return filled ? (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="5" fill="currentColor" />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

export default function PasswordStrengthPopover({ password }) {
  const { t } = useTranslation('auth')
  const checks = checkPassword(password)
  return (
    <div className="gc-pw-strength-popover" role="status" aria-label={t('passwordRules.title')}>
      <p className="gc-pw-strength-popover__title">{t('passwordRules.title')}</p>
      <ul className="gc-pw-strength-popover__list">
        {PW_REQUIREMENTS.map(key => (
          <li key={key} className={`gc-pw-strength-req${checks[key] ? ' gc-pw-strength-req--met' : ''}`}>
            <CircleIcon filled={checks[key]} />
            {t(`passwordRules.${key}`, { min: PASSWORD_POLICY.minLength })}
          </li>
        ))}
      </ul>
    </div>
  )
}
