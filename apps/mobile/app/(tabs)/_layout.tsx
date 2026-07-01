import { Tabs } from 'expo-router'
import SymbolIcon from '../../src/components/SymbolIcon'
import { useTheme } from '../../src/theme/ThemeProvider'

// The four-tab bottom bar: Home · Songs · Setlists · Daily Word. Each screen
// draws its own large-title header (headerShown:false) to match the design, so
// the tab layout only owns the bar. Icons are SF Symbols; the active tab is
// tinted with the accent.

export default function TabsLayout() {
  const t = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.muted,
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <SymbolIcon name={focused ? 'house.fill' : 'house'} size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="songs"
        options={{
          title: 'Songs',
          tabBarIcon: ({ color }) => (
            <SymbolIcon name="music.note.list" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="setlists"
        options={{
          title: 'Setlists',
          tabBarIcon: ({ color }) => (
            <SymbolIcon name="list.bullet" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="daily"
        options={{
          title: 'Daily Word',
          tabBarIcon: ({ color }) => (
            <SymbolIcon name="book" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
