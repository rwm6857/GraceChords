import React from 'react'
import { SegmentedControl } from '../layout-kit'

export default function MobilePaneTabs({
  value,
  onChange,
  addLabel = 'Add',
  currentLabel = 'Current',
  savedLabel,
  className = '',
}){
  const options = [
    { value: 'add', label: addLabel },
    { value: 'current', label: currentLabel },
    ...(savedLabel ? [{ value: 'saved', label: savedLabel }] : []),
  ]
  return (
    <div className={`gc-mobile-pane-tabs ${className}`.trim()}>
      <SegmentedControl
        ariaLabel="Builder pane"
        value={value}
        onChange={onChange}
        options={options}
      />
    </div>
  )
}
