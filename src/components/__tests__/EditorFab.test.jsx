import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import EditorFab from '../EditorFab.jsx'

const roleMock = vi.hoisted(() => ({ isAtLeast: () => true }))
vi.mock('../../hooks/useRole', () => ({
  useRole: () => ({ isAtLeast: roleMock.isAtLeast }),
}))

function renderAt(path){
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EditorFab />
    </MemoryRouter>
  )
}

describe('EditorFab', () => {
  afterEach(() => {
    roleMock.isAtLeast = () => true
  })

  test('renders an edit link on a song page for collaborators', () => {
    renderAt('/song/determined-to-die')
    const link = screen.getByRole('link', { name: /edit this song/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/portal/editor/determined-to-die')
    expect(link).toHaveClass('gc-editor-fab')
  })

  test('also matches the /songs/:slug route', () => {
    renderAt('/songs/determined-to-die')
    expect(screen.getByRole('link', { name: /edit this song/i }))
      .toHaveAttribute('href', '/portal/editor/determined-to-die')
  })

  test('hides for non-collaborators', () => {
    roleMock.isAtLeast = () => false
    renderAt('/song/determined-to-die')
    expect(screen.queryByRole('link', { name: /edit this song/i })).toBeNull()
  })

  test('hides on non-song pages', () => {
    renderAt('/songs')
    expect(screen.queryByRole('link', { name: /edit this song/i })).toBeNull()
  })

  test('hides while already in the editor', () => {
    renderAt('/portal/editor/determined-to-die')
    expect(screen.queryByRole('link', { name: /edit this song/i })).toBeNull()
  })
})
