import React, { useMemo } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { decodeSet } from '../utils/setcode'

export default function WorshipSetRoute(){
  const { code } = useParams()
  const target = useMemo(() => {
    const { entries, error } = decodeSet(code || '')
    if (error || !entries.length) return { to: '/setlist', replace: true }
    const ids = entries.map(e => encodeURIComponent(e.id)).join(',')
    const toKeys = entries.map(e => encodeURIComponent(e.toKey || '')).join(',')
    return { to: `/worship/${ids}?toKeys=${toKeys}`, replace: true }
  }, [code])
  return <Navigate to={target.to} replace={target.replace} />
}
