import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSetlistKeymap } from '../useSetlistKeymap'

const ITEMS = [
  { entryKey: 'a', songId: 'uuid-a', toKey: null, song: { title: 'Abba' } },
  { entryKey: 'b', songId: 'uuid-b', toKey: null, song: { title: 'Cornerstone' } },
  { entryKey: 'c', songId: 'uuid-c', toKey: null, song: { title: 'Doxology' } },
]

let handlers

function Harness({ selectedKey = 'b', enabled = true, items = ITEMS }) {
  useSetlistKeymap({ enabled, items, selectedKey, ...handlers })
  return (
    <div>
      <input aria-label="a text field" />
      <button type="button">somewhere to focus</button>
    </div>
  )
}

beforeEach(() => {
  handlers = {
    onSelect: vi.fn(),
    onMoveBy: vi.fn(),
    onRemove: vi.fn(),
    onTranspose: vi.fn(),
    onFocusSearch: vi.fn(),
    onRename: vi.fn(),
    onWorship: vi.fn(),
    onShortcuts: vi.fn(),
  }
})

describe('useSetlistKeymap', () => {
  it('focuses search on /', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.keyboard('/')
    expect(handlers.onFocusSearch).toHaveBeenCalled()
  })

  it('moves the selection with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<Harness selectedKey="b" />)
    await user.keyboard('{ArrowDown}')
    expect(handlers.onSelect).toHaveBeenCalledWith('c')
    await user.keyboard('{ArrowUp}')
    expect(handlers.onSelect).toHaveBeenCalledWith('a')
  })

  it('reorders with Alt+Arrow rather than moving the selection', async () => {
    const user = userEvent.setup()
    render(<Harness selectedKey="b" />)
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(handlers.onMoveBy).toHaveBeenCalledWith('b', 1)
    expect(handlers.onSelect).not.toHaveBeenCalled()
  })

  it('transposes with + and -', async () => {
    const user = userEvent.setup()
    render(<Harness selectedKey="a" />)
    await user.keyboard('+')
    expect(handlers.onTranspose).toHaveBeenCalledWith('a', 1)
    await user.keyboard('-')
    expect(handlers.onTranspose).toHaveBeenCalledWith('a', -1)
  })

  it('removes, renames and opens Worship Mode', async () => {
    const user = userEvent.setup()
    render(<Harness selectedKey="a" />)
    await user.keyboard('{Delete}')
    expect(handlers.onRemove).toHaveBeenCalledWith('a')
    await user.keyboard('{F2}')
    expect(handlers.onRename).toHaveBeenCalled()
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(handlers.onWorship).toHaveBeenCalled()
  })

  it('stays silent while a text field has focus', async () => {
    const user = userEvent.setup()
    render(<Harness selectedKey="a" />)
    await user.click(screen.getByLabelText('a text field'))
    // Typing a song name must never transpose or delete a row.
    await user.keyboard('Grace+')
    expect(handlers.onTranspose).not.toHaveBeenCalled()
    expect(handlers.onFocusSearch).not.toHaveBeenCalled()
    await user.keyboard('{Backspace}')
    expect(handlers.onRemove).not.toHaveBeenCalled()
  })

  it('does nothing when disabled, so a dialog owns the keyboard', async () => {
    const user = userEvent.setup()
    render(<Harness enabled={false} />)
    await user.keyboard('/')
    await user.keyboard('{ArrowDown}')
    expect(handlers.onFocusSearch).not.toHaveBeenCalled()
    expect(handlers.onSelect).not.toHaveBeenCalled()
  })

  it('ignores row keys when the set is empty', async () => {
    const user = userEvent.setup()
    render(<Harness items={[]} selectedKey={null} />)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Delete}')
    expect(handlers.onSelect).not.toHaveBeenCalled()
    expect(handlers.onRemove).not.toHaveBeenCalled()
  })
})
