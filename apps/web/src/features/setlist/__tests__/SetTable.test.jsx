import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SetTable from '../SetTable'

function item(entryKey, title, over = {}) {
  return {
    entryKey,
    songId: `uuid-${entryKey}`,
    toKey: null,
    song: {
      id: `uuid-${entryKey}`,
      slug: title.toLowerCase(),
      title,
      artist: 'A. Writer',
      default_key: 'G',
      tempo: 72,
      time_signature: '4/4',
      ...over,
    },
  }
}

function renderTable(props = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onMove: vi.fn(),
    onMoveBy: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
    onKeyChange: vi.fn(),
  }
  const items = props.items || [item('a', 'Abba'), item('b', 'Cornerstone')]
  render(<SetTable items={items} selectedKey={null} {...handlers} {...props} />)
  return { ...handlers, items }
}

describe('SetTable', () => {
  it('shows artist, key and tempo in their own columns', () => {
    renderTable()
    expect(screen.getByRole('columnheader', { name: 'Artist' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'BPM' })).toBeInTheDocument()
    expect(screen.getAllByText('A. Writer')).toHaveLength(2)
    expect(screen.getAllByText('72')).toHaveLength(2)
  })

  it('numbers rows by position', () => {
    renderTable()
    const rows = screen.getAllByRole('row').slice(1) // drop the header
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[1]).toHaveTextContent('2')
  })

  it('moves a song with the row arrows', async () => {
    const user = userEvent.setup()
    const { onMoveBy } = renderTable()
    await user.click(screen.getByRole('button', { name: /Move down — Abba/ }))
    expect(onMoveBy).toHaveBeenCalledWith('a', 1)
  })

  it('disables the arrows at the ends of the set', () => {
    renderTable()
    expect(screen.getByRole('button', { name: /Move up — Abba/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Move down — Cornerstone/ })).toBeDisabled()
  })

  it('removes and duplicates by entry key, not by index', async () => {
    const user = userEvent.setup()
    const { onRemove, onDuplicate } = renderTable()
    await user.click(screen.getByRole('button', { name: /Remove — Cornerstone/ }))
    expect(onRemove).toHaveBeenCalledWith('b')
    await user.click(screen.getByRole('button', { name: /Duplicate — Abba/ }))
    expect(onDuplicate).toHaveBeenCalledWith('a')
  })

  it('renders a verse as a keyless row with its translation', () => {
    renderTable({
      items: [
        {
          entryKey: 'v',
          songId: 'v:KJV|John 3:16',
          toKey: null,
          song: {
            id: 'v:KJV|John 3:16',
            slug: '',
            title: 'John 3:16',
            artist: null,
            default_key: null,
            tempo: null,
            time_signature: null,
            verse: true,
            translation: 'KJV',
          },
        },
      ],
    })
    expect(screen.getByText('John 3:16')).toBeInTheDocument()
    expect(screen.getByText('KJV')).toBeInTheDocument()
    // A verse has no key control.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('points at the library when the set is empty', () => {
    renderTable({ items: [] })
    expect(screen.getByText(/No songs yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
