import React from 'react'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  id?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function InputImpl({ label, id, className = '', ...rest }, ref){
  return (
    <label className="gc-field" htmlFor={id}>
      {label ? <span className="gc-label">{label}</span> : null}
      <input ref={ref} id={id} className={`gc-input ${className}`.trim()} {...rest} />
    </label>
  )
})

export default Input

