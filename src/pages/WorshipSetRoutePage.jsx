import React, { useMemo } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { decodeSet } from '../utils/setlists/setcode'
import { useSongs } from '../hooks/useSongs'

export default function WorshipSetRoute(){
  const { code } = useParams()
  const { songs } = useSongs()
  const target = useMemo(() => {
    const { entries, error } = decodeSet(songs, code || '')
    if (error || !entries.length) return { to: '/setlist', replace: true }
    const ids = entries.map(e => encodeURIComponent(e.id)).join(',')
    const toKeys = entries.map(e => encodeURIComponent(e.toKey || '')).join(',')
    return { to: `/worship/${ids}?toKeys=${toKeys}`, replace: true }
  }, [code, songs])
  return <Navigate to={target.to} replace={target.replace} />
}
