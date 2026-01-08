import React, { useMemo, useRef, useState } from 'react'

export default function SegmentedControl({
  options = [],
  value,
  defaultValue,
  onChange,
  className = '',
  ariaLabel,
  ariaLabelledBy,
  ...rest
}){
  const initial = defaultValue ?? (options[0] ? options[0].value : undefined)
  const [internalValue, setInternalValue] = useState(initial)
  const currentValue = value !== undefined ? value : internalValue
  const buttonRefs = useRef([])

  const enabledIndexes = useMemo(() => options.map((opt, i) => opt.disabled ? null : i).filter(i => i !== null), [options])

  function setValue(next){
    if (value === undefined) setInternalValue(next)
    onChange?.(next)
  }

  function focusIndex(nextIndex){
    const btn = buttonRefs.current[nextIndex]
    if (btn && typeof btn.focus === 'function') btn.focus()
  }

  function handleKeyDown(e, idx){
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const enabled = enabledIndexes
    if (!enabled.length) return
    const pos = enabled.indexOf(idx)
    if (pos === -1) return
    let nextPos = pos
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextPos = (pos + 1) % enabled.length
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextPos = (pos - 1 + enabled.length) % enabled.length
    if (e.key === 'Home') nextPos = 0
    if (e.key === 'End') nextPos = enabled.length - 1
    const nextIndex = enabled[nextPos]
    const nextValue = options[nextIndex]?.value
    if (nextValue !== undefined) setValue(nextValue)
    focusIndex(nextIndex)
  }

  return (
    <div
      className={`gc-segmented ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      {...rest}
    >
      {options.map((opt, idx) => {
        const selected = opt.value === currentValue
        return (
          <button
            key={opt.value ?? idx}
            ref={(el) => { buttonRefs.current[idx] = el }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            className={`gc-segmented__item ${selected ? 'is-selected' : ''}`.trim()}
            tabIndex={selected ? 0 : -1}
            onClick={() => setValue(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            {opt.label ?? opt.value}
          </button>
        )
      })}
    </div>
  )
}
