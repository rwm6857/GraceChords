import { describe, it, expect, afterEach } from 'vitest'
import { isAndroid, isIOS, isIOSSafari, isNativeAppBannerActive } from '../platform'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15'
const IPHONE_FACEBOOK_WEBVIEW =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/468.0]'
// iPadOS 13+ ships "Request Desktop Website" on by default.
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const MAC_SAFARI = IPAD_DESKTOP_UA
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const original = {}

function stubClient({ ua, touchPoints = 0, touchEvents = false, standalone = undefined }) {
  original.ua = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
  original.mtp = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints')
  original.standalone = Object.getOwnPropertyDescriptor(navigator, 'standalone')
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true })
  if (standalone !== undefined) {
    Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true })
  }
  if (touchEvents) document.ontouchend = null
}

afterEach(() => {
  for (const [prop, key] of [['userAgent', 'ua'], ['maxTouchPoints', 'mtp'], ['standalone', 'standalone']]) {
    if (original[key]) Object.defineProperty(navigator, prop, original[key])
    else delete navigator[prop]
  }
  delete document.ontouchend
})

describe('isIOS', () => {
  it('detects iPhone', () => {
    stubClient({ ua: IPHONE_SAFARI })
    expect(isIOS()).toBe(true)
  })

  it('detects an iPad reporting the desktop Macintosh UA', () => {
    stubClient({ ua: IPAD_DESKTOP_UA, touchPoints: 5, touchEvents: true })
    expect(isIOS()).toBe(true)
  })

  it('does not mistake desktop Safari on macOS for an iPad', () => {
    // Same UA string as the iPad case — maxTouchPoints is the only thing that
    // separates them, so this pins the check that ontouchend alone would miss.
    stubClient({ ua: MAC_SAFARI, touchPoints: 0, touchEvents: true })
    expect(isIOS()).toBe(false)
  })

  it('is false on Android and desktop Chrome', () => {
    stubClient({ ua: ANDROID_CHROME })
    expect(isIOS()).toBe(false)
    expect(isAndroid()).toBe(true)
  })
})

describe('isIOSSafari', () => {
  it('is true for Safari on iPhone', () => {
    stubClient({ ua: IPHONE_SAFARI })
    expect(isIOSSafari()).toBe(true)
  })

  it.each([
    ['Chrome', IPHONE_CHROME],
    ['Firefox', IPHONE_FIREFOX],
    ['a Facebook webview', IPHONE_FACEBOOK_WEBVIEW],
  ])('is false for %s on iOS', (_label, ua) => {
    stubClient({ ua })
    expect(isIOSSafari()).toBe(false)
  })

  it('is false off iOS entirely', () => {
    stubClient({ ua: DESKTOP_CHROME })
    expect(isIOSSafari()).toBe(false)
  })
})

describe('isNativeAppBannerActive', () => {
  it('is true in iOS Safari, where the Smart App Banner renders', () => {
    stubClient({ ua: IPHONE_SAFARI })
    expect(isNativeAppBannerActive()).toBe(true)
  })

  it('is false in an installed home-screen PWA — Safari suppresses the banner there', () => {
    stubClient({ ua: IPHONE_SAFARI, standalone: true })
    expect(isNativeAppBannerActive()).toBe(false)
  })

  it('is false in Chrome on iOS, which never shows the native banner', () => {
    stubClient({ ua: IPHONE_CHROME })
    expect(isNativeAppBannerActive()).toBe(false)
  })
})
