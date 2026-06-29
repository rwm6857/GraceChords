import React from 'react'

const MobileDock = React.forwardRef(function MobileDock({
  children,
  className = '',
  dimmed = false,
  ...rest
}, ref){
  return (
    <div
      ref={ref}
      className={`gc-mobile-dock ${dimmed ? 'is-dimmed' : ''} ${className}`.trim()}
      {...rest}
    >
      <div className="gc-mobile-dock__inner">
        {children}
      </div>
    </div>
  )
})

export default MobileDock
