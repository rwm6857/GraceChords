import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { Platform } from 'react-native'
import { ThemeProvider as NavThemeProvider } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../src/theme/ThemeProvider'
import { useNavigationTheme } from '../../src/theme/navigationTheme'

// The five-tab bottom bar: Home · Songs · Setlists · Daily Word · Utilities.
// Rendered by the OS via Expo Router's NativeTabs — Liquid Glass on iOS/iPadOS
// 26, the standard native bar on iOS 18, Material 3 on Android — so the bar
// chrome (background, separator, blur) is owned by the system, not us. We keep
// only the brand touch: the selected tab is tinted Signal Blue (t.colors.accent,
// which resolves to #1F84C9 / #4EA6E6 and honors the user's forced-theme
// preference). Each screen still draws its own large-title header
// (headerShown:false lives on the root Stack, not here).
//
// Icons supply both `sf` (SF Symbols — the iOS design-system requirement) and
// `md` (Material Symbols) for the Android bar. The md picks share the same
// SF→Material convention as the in-app SymbolIcon (see src/components/symbolMap.ts):
// queue_music, list, menu_book, and handyman all match their SymbolIcon
// counterparts so the tab bar and the rest of the UI stay visually consistent
// on Android. Every tab uses the { default, selected } form so the selected
// glyph fills in (outline → solid) on selection — NativeTabs does not auto-apply
// the .fill variant, so it must be named explicitly. Songs and Setlists use
// music.pages / music.note.square.stack
// because their previous glyphs (music.note.list, list.bullet) have no .fill twin
// in SF Symbols and so could not invert.
//
// …but all four of those names are SF Symbols 2025, i.e. iOS 26.0+ ONLY (checked
// against CoreGlyphs' name_availability.plist). UIKit draws nothing at all for a
// symbol name it does not know, so on iOS 18 the Songs and Setlists tabs came up
// as bare labels with a hole where the icon belongs, while the other three
// (house / book / wrench.and.screwdriver — iOS 13–14) were fine. SONGS_ICON and
// SETLISTS_ICON below fall back to long-lived glyphs when the OS predates 26, so
// the bar is complete on every version the app supports (floor: iOS 15.1).
// The fallbacks: music.note.list (iOS 13 — and the same glyph Android's
// queue_music draws, so the two platforms still agree) and
// list.bullet.rectangle.portrait (iOS 15, which unlike plain list.bullet does
// have a .fill twin). music.note.list has no .fill twin, so it repeats for
// `selected` and that one tab tints rather than inverting on older iOS — the
// same trade-off that motivated the iOS 26 glyphs, now scoped to old versions
// instead of applied everywhere. iOS 26 and Android are untouched.
//
// The NavThemeProvider wrapper (React Navigation's theme, matched to the current
// color scheme) is required to prevent the known iOS 26 dark-mode glass flicker
// on header buttons when switching tabs. It is aliased so it does not shadow the
// app's own token ThemeProvider. The theme itself comes from useNavigationTheme
// (src/theme/navigationTheme.ts) rather than the stock React Navigation
// palettes: expo-router paints each tab's content container with that theme's
// background, and any mismatch with our page background washes through the
// iOS 18+ tab cross-dissolve as a full-screen fade.
//
// Android bar tuning (Material 3): `labelVisibilityMode="labeled"` keeps every
// tab's label visible. The NativeTabs default is `auto`, which — with five tabs
// (>3) — collapses labels to the selected tab only, leaving the other four as
// lone icons floating in the 80dp Material bar. That sparse, top-heavy layout is
// the "lots of blank space / bulky" feel; always-on labels fill the bar so it
// reads as balanced and intentional, and matches Material 3's own guidance that
// navigation-bar labels stay visible. `labelVisibilityMode` is an Android-only
// NativeTabs prop (`@platform android`) — iOS ignores it, so the iOS Liquid-Glass
// and standard bars are untouched. The small label-size nudge goes through the
// cross-platform `labelStyle`, so it is gated to Android to leave iOS labels
// exactly as the system draws them.

// Liquid Glass and the 2025 symbol set both land in iOS 26, so one check gates
// everything that differs between the glass bar and the older opaque one.
// Platform.Version is the OS version string on iOS ("26.5"); on Android it is
// the API level, which would read as far below 26 — hence the explicit OS guard
// rather than a bare number comparison.
const IS_IOS_26_PLUS =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

// iOS 15–18 draw the bar with UIKit's scroll-edge appearance, which is fully
// transparent: with content scrolled under it the bar vanished and the icons
// and labels floated over the song list. Glass is *meant* to be translucent, so
// this is scoped to pre-26 only and Android (Material 3, already opaque) never
// sees it.
const NEEDS_OPAQUE_TAB_BAR = Platform.OS === 'ios' && !IS_IOS_26_PLUS

const SONGS_ICON = IS_IOS_26_PLUS
  ? ({ default: 'music.pages', selected: 'music.pages.fill' } as const)
  : ({ default: 'music.note.list', selected: 'music.note.list' } as const)

const SETLISTS_ICON = IS_IOS_26_PLUS
  ? ({ default: 'music.note.square.stack', selected: 'music.note.square.stack.fill' } as const)
  : ({
      default: 'list.bullet.rectangle.portrait',
      selected: 'list.bullet.rectangle.portrait.fill',
    } as const)

export default function TabsLayout() {
  const t = useTheme()
  const navTheme = useNavigationTheme()
  const { t: tx } = useTranslation('nav')
  return (
    <NavThemeProvider value={navTheme}>
      <NativeTabs
        tintColor={t.colors.accent}
        labelVisibilityMode="labeled"
        labelStyle={Platform.OS === 'android' ? { fontSize: 13 } : undefined}
        disableTransparentOnScrollEdge={NEEDS_OPAQUE_TAB_BAR}
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'house', selected: 'house.fill' }}
            md="home"
          />
          <NativeTabs.Trigger.Label>{tx('home')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="songs">
          <NativeTabs.Trigger.Icon
            sf={SONGS_ICON}
            md="queue_music"
          />
          <NativeTabs.Trigger.Label>{tx('songs')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="setlists">
          <NativeTabs.Trigger.Icon
            sf={SETLISTS_ICON}
            md="list"
          />
          <NativeTabs.Trigger.Label>{tx('setlists')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="daily">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'book', selected: 'book.fill' }}
            md="menu_book"
          />
          <NativeTabs.Trigger.Label>{tx('dailyWord')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="utilities">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'wrench.and.screwdriver', selected: 'wrench.and.screwdriver.fill' }}
            md="handyman"
          />
          <NativeTabs.Trigger.Label>{tx('utilities')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </NavThemeProvider>
  )
}
