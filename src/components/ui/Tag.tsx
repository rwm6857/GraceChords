import React from 'react'

type TagProps = {
  children: React.ReactNode
  color?: 'blue' | 'green' | 'amber' | 'gray'
  className?: string
}

export default function Tag({ children, color = 'gray', className = '' }: TagProps){
  return (
    <span className={[`gc-tag gc-tag--${color}`, className].filter(Boolean).join(' ')}>{children}</span>
  )
}

