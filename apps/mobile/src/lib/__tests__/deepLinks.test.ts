import { describe, it, expect } from 'vitest'
import { deepLinkStackRouteKey, resolveDeepLinkPath } from '../deepLinks'

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

describe('deepLinkStackRouteKey', () => {
  it.each([
    ['/viewer/amazing-grace', 'viewer/[slug]'],
    ['/setlist/import?code=ABC123', 'setlist/import'],
    ['/setlist/import?ids=one,two&toKeys=G', 'setlist/import'],
    ['/session/XYZ', 'session/[code]'],
  ])('keys %s as %s', (target, key) => {
    expect(deepLinkStackRouteKey(target)).toBe(key)
  })

  it('keys two different songs the same, so the second link replaces the first', () => {
    expect(deepLinkStackRouteKey('/viewer/one')).toBe(deepLinkStackRouteKey('/viewer/two'))
  })

  it.each(['/', '/songs', '/setlists', '/daily', '/songbook', '/about', '/settings'])(
    'returns null for the tab or single-instance target %s',
    (target) => {
      expect(deepLinkStackRouteKey(target)).toBeNull()
    },
  )

  it('returns null for a passthrough URL', () => {
    expect(deepLinkStackRouteKey('https://gracechords.com/admin')).toBeNull()
  })

  // The reason the key is the whole route and not just the first segment: an inbound
  // /setlist/<x> resolves to the import preview, never to the in-app setlist/[id], so
  // a shared-set link arriving while the user sits on their own setlist still pushes.
  it('never keys an inbound setlist link as the in-app setlist detail route', () => {
    const target = resolveDeepLinkPath('https://gracechords.com/setlist/one,two')
    expect(target).toBe('/setlist/import?ids=one,two')
    expect(deepLinkStackRouteKey(target)).toBe('setlist/import')
  })
})
