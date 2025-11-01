import React from 'react'
const S = ({children,size=18}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
export const DownloadIcon = (p)=> <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></S>
export const TransposeIcon = (p)=> <S {...p}><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/><path d="M12 8v8"/></S>
export const MediaIcon = (p)=> <S {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></S>
export const SelectAllIcon = (p)=> <S {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></S>
export const ClearIcon = (p)=> <S {...p}><path d="M3 6h18"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></S>
export const EyeIcon = (p)=> <S {...p}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></S>
export const SetlistIcon = (p)=> <S {...p}><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></S>
export const ArrowUp = (p)=> <S {...p}><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></S>
export const ArrowDown = (p)=> <S {...p}><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></S>
export const ArrowLeft = (p)=> <S {...p}><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></S>
export const ArrowRight = (p)=> <S {...p}><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></S>
export const RemoveIcon = (p)=> <S {...p}><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></S>
export const GearIcon = (p)=> (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82h0A1.65 1.65 0 0 0 20.91 11H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </S>
)

export const Sun = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="4" stroke="currentColor" fill="none" strokeWidth="2"/>
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

export const Moon = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const PlusIcon = (p)=> <S {...p}><path d="M12 5v14"/><path d="M5 12h14"/></S>
export const SaveIcon = (p)=> <S {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21V13H7v8"/><path d="M7 3v5h8"/></S>
export const CopyIcon = (p)=> <S {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></S>
export const TrashIcon = (p)=> <S {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></S>
export const PrintIcon = (p)=> <S {...p}><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="2"/></S>
export const MinusIcon = (p)=> <S {...p}><path d="M5 12h14"/></S>
export const LinkIcon = (p)=> <S {...p}><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0 0-7.07 5 5 0 0 0-7.07 0L10 5"/><path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.43a5 5 0 1 0 7.07 7.07L14 19"/></S>

// Search (magnifying glass)
export const SearchIcon = (p)=> (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </S>
)

// Cloud upload
export const CloudUploadIcon = (p)=> (
  <S {...p}>
    <path d="M16 16l-4-4-4 4" />
    <path d="M12 12v8" />
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 16" />
  </S>
)

// Cloud download
export const CloudDownloadIcon = (p)=> (
  <S {...p}>
    <path d="M8 12l4 4 4-4" />
    <path d="M12 8v8" />
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 16" />
  </S>
)

// Column toggle icons
export const OneColIcon = (p) => (
  <S {...p}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </S>
)

export const TwoColIcon = (p) => (
  <S {...p}>
    {/* left stack */}
    <line x1="4" y1="7" x2="10" y2="7" />
    <line x1="4" y1="12" x2="10" y2="12" />
    <line x1="4" y1="17" x2="10" y2="17" />
    {/* right stack */}
    <line x1="14" y1="7" x2="20" y2="7" />
    <line x1="14" y1="12" x2="20" y2="12" />
    <line x1="14" y1="17" x2="20" y2="17" />
  </S>
)

export const HomeIcon = (p) => (
  <S {...p}>
    <path d="M3 11l9-8 9 8"/>
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>
  </S>
)
