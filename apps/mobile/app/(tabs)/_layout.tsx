import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { Platform } from 'react-native'
import { ThemeProvider as NavThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../src/theme/ThemeProvider'

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
// The NavThemeProvider wrapper (React Navigation's theme, matched to the current
// color scheme) is required to prevent the known iOS 26 dark-mode glass flicker
// on header buttons when switching tabs. It is aliased so it does not shadow the
// app's own token ThemeProvider.
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

export default function TabsLayout() {
  const t = useTheme()
  const { t: tx } = useTranslation('nav')
  return (
    <NavThemeProvider value={t.mode === 'dark' ? DarkTheme : DefaultTheme}>
      <NativeTabs
        tintColor={t.colors.accent}
        labelVisibilityMode="labeled"
        labelStyle={Platform.OS === 'android' ? { fontSize: 13 } : undefined}
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
            sf={{ default: 'music.pages', selected: 'music.pages.fill' }}
            md="queue_music"
          />
          <NativeTabs.Trigger.Label>{tx('songs')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="setlists">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'music.note.square.stack', selected: 'music.note.square.stack.fill' }}
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
