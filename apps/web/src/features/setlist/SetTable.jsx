import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import KeySelector from '../../components/KeySelector'
import { ChevronDownIcon, ChevronUpIcon, DragHandleIcon, DuplicateIcon, RemoveIcon } from '../../components/Icons'
import { effectiveEntryKey } from '../../utils/setlists/entries'

// The set as a table: position, title, artist, key, tempo. Wider than a phone
// can be, which is the point — artist, key and BPM line up in their own columns
// so a whole set reads at a glance.
//
// Reordering has two paths on purpose. Mouse users drag the row number;
// keyboard users select a row and press the arrow buttons (or Alt+Arrow, bound
// by useSetlistKeymap). The old page shipped the move() helper but rendered no
// control for it, so there was no keyboard or touch reorder at all.
export default function SetTable({
  items,
  selectedKey,
  onSelect,
  onMove,
  onMoveBy,
  onRemove,
  onDuplicate,
  onKeyChange,
}) {
  const { t } = useTranslation('pages')
  const [dragKey, setDragKey] = useState(null)
  const [overKey, setOverKey] = useState(null)

  if (!items.length) {
    return <div className="gc-set-empty">{t('setlist.emptySet')}</div>
  }

  return (
    <table className="gc-set-table">
      <thead>
        <tr>
          <th scope="col" className="gc-col-num">#</th>
          <th scope="col">{t('setlist.colTitle')}</th>
          <th scope="col" className="gc-col-artist">{t('setlist.colArtist')}</th>
          <th scope="col" className="gc-col-key">{t('setlist.colKey')}</th>
          <th scope="col" className="gc-col-bpm">{t('setlist.colTempo')}</th>
          <th scope="col" className="gc-col-actions">
            <span className="gc-sr-only">{t('setlist.colActions')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => {
          const song = item.song
          const isVerse = !!song.verse
          const selected = item.entryKey === selectedKey
          const classes = [
            'gc-set-row',
            selected ? 'is-selected' : '',
            dragKey === item.entryKey ? 'is-dragging' : '',
            overKey === item.entryKey ? 'is-drop-target' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <tr
              key={item.entryKey}
              className={classes}
              tabIndex={0}
              aria-selected={selected}
              onFocus={() => onSelect(item.entryKey)}
              onClick={() => onSelect(item.entryKey)}
              onDragOver={(e) => {
                if (!dragKey || dragKey === item.entryKey) return
                e.preventDefault()
                setOverKey(item.entryKey)
              }}
              onDragLeave={() => setOverKey((k) => (k === item.entryKey ? null : k))}
              onDrop={(e) => {
                e.preventDefault()
                setOverKey(null)
                const from = e.dataTransfer.getData('text/plain') || dragKey
                setDragKey(null)
                if (from && from !== item.entryKey) onMove(from, item.entryKey)
              }}
            >
              <td className="gc-col-num">
                <span
                  className="gc-set-grip"
                  draggable
                  title={t('setlist.dragToReorder')}
                  onDragStart={(e) => {
                    setDragKey(item.entryKey)
                    try {
                      e.dataTransfer.setData('text/plain', item.entryKey)
                      e.dataTransfer.effectAllowed = 'move'
                    } catch {
                      /* older browsers */
                    }
                  }}
                  onDragEnd={() => {
                    setDragKey(null)
                    setOverKey(null)
                  }}
                >
                  <span className="gc-set-pos">{index + 1}</span>
                  <DragHandleIcon />
                </span>
              </td>
              <td className="gc-set-title-cell">
                <span className="gc-set-song-title">{song.title || t('setlist.scripture')}</span>
                {isVerse && song.translation ? (
                  <span className="gc-verse-badge">{song.translation}</span>
                ) : null}
              </td>
              <td className="gc-col-artist">{song.artist || '—'}</td>
              <td className="gc-col-key" onClick={(e) => e.stopPropagation()}>
                {isVerse ? (
                  '—'
                ) : (
                  <KeySelector
                    className="gc-key-select"
                    baseKey={song.default_key || 'C'}
                    valueKey={effectiveEntryKey(item) || 'C'}
                    title={t('setlist.keyFor', { title: song.title })}
                    onChange={(next) => onKeyChange(item.entryKey, next)}
                  />
                )}
              </td>
              <td className="gc-col-bpm">{song.tempo ? song.tempo : '—'}</td>
              <td className="gc-col-actions">
                <span className="gc-set-row-actions">
                  <button
                    type="button"
                    className="gc-icon-action"
                    title={t('setlist.moveUp')}
                    aria-label={`${t('setlist.moveUp')} — ${song.title}`}
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveBy(item.entryKey, -1)
                    }}
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    type="button"
                    className="gc-icon-action"
                    title={t('setlist.moveDown')}
                    aria-label={`${t('setlist.moveDown')} — ${song.title}`}
                    disabled={index === items.length - 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveBy(item.entryKey, 1)
                    }}
                  >
                    <ChevronDownIcon />
                  </button>
                  <button
                    type="button"
                    className="gc-icon-action"
                    title={t('setlist.duplicateSong')}
                    aria-label={`${t('setlist.duplicateSong')} — ${song.title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDuplicate(item.entryKey)
                    }}
                  >
                    <DuplicateIcon />
                  </button>
                  <button
                    type="button"
                    className="gc-icon-action is-danger"
                    title={t('setlist.remove')}
                    aria-label={`${t('setlist.remove')} — ${song.title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(item.entryKey)
                    }}
                  >
                    <RemoveIcon />
                  </button>
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
