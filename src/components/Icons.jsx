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
export const RemoveIcon = (p)=> <S {...p}><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></S>
