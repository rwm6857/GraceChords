import React from 'react'
import './layout.css'

export default function PageContainer({ children, style, className = '' }){
  return (
    <div className={["gc-page", className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
}

