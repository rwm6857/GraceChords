import React from 'react'

const Input = React.forwardRef(function InputImpl({ label, id, className = '', ...rest }, ref){
  return (
    <label className="gc-field" htmlFor={id}>
      {label ? <span className="gc-label">{label}</span> : null}
      <input ref={ref} id={id} className={`gc-input ${className}`.trim()} {...rest} />
    </label>
  )
})

export default Input
