import React from 'react'

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  id?: string
}

export default function Select({ label, id, children, className = '', ...rest }: SelectProps){
  return (
    <label className="gc-field" htmlFor={id}>
      {label ? <span className="gc-label">{label}</span> : null}
      <span className="gc-select">
        <select id={id} className={className} {...rest}>{children}</select>
      </span>
    </label>
  )
}

