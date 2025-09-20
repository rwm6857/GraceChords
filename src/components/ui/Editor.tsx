import React from 'react'
import { fonts } from '../../theme/fonts'

type Props = {
  value: string
  onChange: (v: string) => void
  textareaRef?: React.Ref<HTMLTextAreaElement>
  preview?: React.ReactNode
}

export default function Editor({ value, onChange, textareaRef, preview }: Props){
  const fontSize = preview
    ? 'clamp(14px, 2.8vw, 16px)'
    : 'clamp(12px, 2.5vw, 14px)' // slightly smaller when preview is off
  return (
    <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: 10 }}>
      <textarea
        ref={textareaRef as any}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          minHeight: '60vh',
          fontFamily: fonts.editor,
          fontSize,
        }}
      />
      {preview ? (
        <div className="card" style={{ minHeight: '60vh', overflow: 'auto' }}>
          {preview}
        </div>
      ) : null}
    </div>
  )
}
