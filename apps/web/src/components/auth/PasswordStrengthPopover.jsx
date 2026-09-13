import React from 'react'
import { PASSWORD_POLICY, checkPassword } from '@gracechords/core'

// The rules themselves live in @gracechords/core so this list, the mobile
// requirement line and both validators cannot drift apart — see
// packages/core/src/auth/passwordPolicy.ts. Only the labels are local.
const PW_REQUIREMENTS = [
  { key: 'minLength',  label: `At least ${PASSWORD_POLICY.minLength} characters` },
  { key: 'hasLower',   label: 'One lowercase letter' },
  { key: 'hasUpper',   label: 'One uppercase letter' },
  { key: 'hasDigit',   label: 'One number' },
  { key: 'hasSymbol',  label: 'One special character' },
]

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
  const checks = checkPassword(password)
  return (
    <div className="gc-pw-strength-popover" role="status" aria-label="Password requirements">
      <p className="gc-pw-strength-popover__title">Password requirements</p>
      <ul className="gc-pw-strength-popover__list">
        {PW_REQUIREMENTS.map(({ key, label }) => (
          <li key={key} className={`gc-pw-strength-req${checks[key] ? ' gc-pw-strength-req--met' : ''}`}>
            <CircleIcon filled={checks[key]} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
