import { describe, it, expect } from 'vitest'
import { resolveDeepLinkPath } from '../deepLinks'

const WEB = 'https://gracechords.com'

describe('resolveDeepLinkPath', () => {
  describe('direct parallels', () => {
    it.each([
      ['/', '/'],
      ['/songs', '/songs'],
      ['/setlist', '/setlists'],
      ['/worship', '/setlists'],
      ['/reading', '/daily'],
      ['/songbook', '/songbook'],
      ['/about', '/about'],
      ['/profile', '/settings'],
    ])('%s -> %s', (from, to) => {
      expect(resolveDeepLinkPath(`${WEB}${from}`)).toBe(to)
    })

    it('resolves the bare origin to the home tab', () => {
      expect(resolveDeepLinkPath(WEB)).toBe('/')
    })
  })

  describe('song detail', () => {
    it('rewrites /song/:id to the viewer', () => {
      expect(resolveDeepLinkPath(`${WEB}/song/amazing-grace`)).toBe('/viewer/amazing-grace')
    })

    it('rewrites the /songs/:id alias to the viewer', () => {
      expect(resolveDeepLinkPath(`${WEB}/songs/amazing-grace`)).toBe('/viewer/amazing-grace')
    })

    it('re-encodes a slug containing reserved characters', () => {
      expect(resolveDeepLinkPath(`${WEB}/song/tis%20so%20sweet`)).toBe('/viewer/tis%20so%20sweet')
    })
  })

  describe('shared setlists', () => {
    it('maps the compact code form to the import preview', () => {
      expect(resolveDeepLinkPath(`${WEB}/set/ABC123`)).toBe('/setlist/import?code=ABC123')
    })

    it('maps the /worship/set code mirror to the import preview', () => {
      expect(resolveDeepLinkPath(`${WEB}/worship/set/ABC123`)).toBe('/setlist/import?code=ABC123')
    })

    it('forwards the slug list and raw toKeys verbatim', () => {
      expect(resolveDeepLinkPath(`${WEB}/setlist/one,two?toKeys=G,A`)).toBe(
        '/setlist/import?ids=one,two&toKeys=G,A',
      )
    })

    it('keeps per-item encoding in the slug list intact', () => {
      expect(resolveDeepLinkPath(`${WEB}/setlist/a%2Cb,two`)).toBe('/setlist/import?ids=a%2Cb,two')
    })

    it('maps the /worship slug-list mirror to the import preview', () => {
      expect(resolveDeepLinkPath(`${WEB}/worship/one,two?toKeys=G`)).toBe(
        '/setlist/import?ids=one,two&toKeys=G',
      )
    })

    it('omits toKeys when the link carries none', () => {
      expect(resolveDeepLinkPath(`${WEB}/setlist/one,two`)).toBe('/setlist/import?ids=one,two')
    })
  })

  describe('live session', () => {
    it('maps /s/:code to the follower screen', () => {
      expect(resolveDeepLinkPath(`${WEB}/s/XYZ`)).toBe('/session/XYZ')
    })

    it('handles the gracechords:// custom-scheme form', () => {
      expect(resolveDeepLinkPath('gracechords://s/XYZ')).toBe('/session/XYZ')
    })
  })

  describe('no app parallel', () => {
    it('sends the blog index to the home tab', () => {
      expect(resolveDeepLinkPath(`${WEB}/posts`)).toBe('/')
    })

    it('sends a blog post to the home tab', () => {
      expect(resolveDeepLinkPath(`${WEB}/posts/a-post-slug`)).toBe('/')
    })
  })

  describe('passthrough', () => {
    it('leaves the app-owned import route untouched', () => {
      expect(resolveDeepLinkPath('/setlist/import?code=ABC')).toBe('/setlist/import?code=ABC')
    })

    it('leaves an unclaimed web path untouched', () => {
      expect(resolveDeepLinkPath(`${WEB}/admin`)).toBe(`${WEB}/admin`)
    })

    it('leaves an unrecognised custom-scheme link untouched', () => {
      expect(resolveDeepLinkPath('gracechords://daily')).toBe('gracechords://daily')
    })
  })
})
