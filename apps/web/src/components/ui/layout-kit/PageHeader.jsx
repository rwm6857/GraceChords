import React from 'react'

export default function PageHeader({
  title,
  subtitle,
  actions,
  className = '',
  children,
  ...rest
}){
  return (
    <header className={`gc-page-header ${className}`.trim()} {...rest}>
      <div className="gc-page-header__main">
        <div className="gc-page-header__text">
          {title ? <h1 className="gc-page-header__title">{title}</h1> : null}
          {subtitle ? <p className="gc-page-header__subtitle">{subtitle}</p> : null}
          {children}
        </div>
        {actions ? <div className="gc-page-header__actions">{actions}</div> : null}
      </div>
    </header>
  )
}
