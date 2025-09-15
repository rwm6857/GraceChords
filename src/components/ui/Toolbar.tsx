import React from 'react'

type Props = React.HTMLAttributes<HTMLDivElement>

export default function Toolbar({ className = '', children, ...rest }: Props){
  return (
    <div className={["gc-toolbar", className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}

