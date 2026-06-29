import React from 'react'

const PW_REQUIREMENTS = [
  { key: 'minLength',  label: 'At least 8 characters' },
  { key: 'hasLower',   label: 'One lowercase letter' },
  { key: 'hasUpper',   label: 'One uppercase letter' },
  { key: 'hasNumber',  label: 'One number' },
  { key: 'hasSpecial', label: 'One special character' },
]

export function checkPassword(pw) {
  return {
    minLength:  pw.length >= 8,
    hasLower:   /[a-z]/.test(pw),
    hasUpper:   /[A-Z]/.test(pw),
    hasNumber:  /[0-9]/.test(pw),
    hasSpecial: /[^A-Za-z0-9]/.test(pw),
  }
}

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
