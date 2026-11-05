import { describe, it, expect } from 'vitest'
import { cloudinaryUrl } from '../cloudinary'

const BASE = 'https://res.cloudinary.com/demo/image/upload/'

describe('cloudinaryUrl', () => {
  it('adds format, quality and width to a versioned upload URL', () => {
    expect(cloudinaryUrl(`${BASE}v1712345/posts/cover.jpg`, 1200))
      .toBe(`${BASE}f_auto,q_auto,c_limit,w_1200/v1712345/posts/cover.jpg`)
  })

  it('adds them to an unversioned upload URL', () => {
    expect(cloudinaryUrl(`${BASE}cover.png`, 800))
      .toBe(`${BASE}f_auto,q_auto,c_limit,w_800/cover.png`)
  })

  it('leaves a URL that already has a transformation alone', () => {
    const url = `${BASE}c_fill,w_400/v1712345/cover.jpg`
    expect(cloudinaryUrl(url, 1200)).toBe(url)
  })

  it('leaves non-Cloudinary and empty values alone', () => {
    expect(cloudinaryUrl('https://example.com/a.jpg', 1200)).toBe('https://example.com/a.jpg')
    expect(cloudinaryUrl(null, 1200)).toBe(null)
  })
})
