import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { ThemeProvider as NavThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native'
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
// `md` (Material Symbols) so the Android bar is wired ahead of time; Android is
// not the current target, hence the TODO markers on the md picks. Every tab uses
// the { default, selected } form so the selected glyph fills in (outline → solid)
// on selection — NativeTabs does not auto-apply the .fill variant, so it must be
// named explicitly. Songs and Setlists use music.pages / music.note.square.stack
// because their previous glyphs (music.note.list, list.bullet) have no .fill twin
// in SF Symbols and so could not invert.
//
// The NavThemeProvider wrapper (React Navigation's theme, matched to the current
// color scheme) is required to prevent the known iOS 26 dark-mode glass flicker
// on header buttons when switching tabs. It is aliased so it does not shadow the
// app's own token ThemeProvider.

export default function TabsLayout() {
  const t = useTheme()
  return (
    <NavThemeProvider value={t.mode === 'dark' ? DarkTheme : DefaultTheme}>
      <NativeTabs tintColor={t.colors.accent}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'house', selected: 'house.fill' }}
            md="home" // TODO(android): verify
          />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="songs">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'music.pages', selected: 'music.pages.fill' }}
            md="queue_music" // TODO(android): verify
          />
          <NativeTabs.Trigger.Label>Songs</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="setlists">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'music.note.square.stack', selected: 'music.note.square.stack.fill' }}
            md="list" // TODO(android): verify
          />
          <NativeTabs.Trigger.Label>Setlists</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="daily">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'book', selected: 'book.fill' }}
            md="menu_book" // TODO(android): verify
          />
          <NativeTabs.Trigger.Label>Daily Word</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="utilities">
          <NativeTabs.Trigger.Icon
            sf={{ default: 'wrench.and.screwdriver', selected: 'wrench.and.screwdriver.fill' }}
            md="handyman" // TODO(android): verify
          />
          <NativeTabs.Trigger.Label>Utilities</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </NavThemeProvider>
  )
}
