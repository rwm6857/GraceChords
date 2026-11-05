import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import YouTubeFacade from '../YouTubeFacade'

describe('YouTubeFacade', () => {
  it('shows only a thumbnail until clicked, then mounts the player', () => {
    const { container } = render(<YouTubeFacade videoId="dQw4w9WgXcQ" title="Reference Video" />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('img').getAttribute('src'))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')

    fireEvent.click(screen.getByRole('button', { name: 'Reference Video' }))

    const iframe = container.querySelector('iframe')
    expect(iframe.getAttribute('src'))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1')
    expect(iframe.getAttribute('title')).toBe('Reference Video')
  })
})
