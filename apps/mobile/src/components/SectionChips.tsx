import { useState } from 'react'
import { Pressable, ScrollView, Text } from 'react-native'
import type { SongSection } from '@gracechords/core'
import { useTheme } from '../theme/ThemeProvider'

// Slim section-jump strip pinned under the viewer header. Purpose-built
// smaller pills than the Chip primitive (Chip's tag sizing is too large for
// this dense strip). Active index tracks the last tapped chip.

const ABBREV: Record<string, string> = {
  verse: 'V',
  chorus: 'Ch',
  'pre-chorus': 'PC',
  prechorus: 'PC',
  bridge: 'Br',
  intro: 'Intro',
  outro: 'Outro',
  tag: 'Tag',
  refrain: 'Ref',
  interlude: 'Int',
  instrumental: 'Inst',
  ending: 'End',
}

function abbrev(label: string, index: number): string {
  const trimmed = label.trim()
  if (!trimmed) return `#${index + 1}`
  const m = trimmed.match(/^(.*?)\s*(\d+)?$/)
  const word = (m?.[1] || trimmed).toLowerCase()
  const base = ABBREV[word]
  return base ? base + (m?.[2] || '') : trimmed.slice(0, 8)
}

export default function SectionChips({
  sections,
  onJump,
}: {
  sections: SongSection[]
  onJump: (index: number) => void
}) {
  const t = useTheme()
  const [active, setActive] = useState(0)

  if (sections.length < 2) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
        gap: 6,
        flexDirection: 'row',
      }}
    >
      {sections.map((section, i) => {
        const selected = i === active
        return (
          <Pressable
            key={i}
            onPress={() => {
              setActive(i)
              onJump(i)
            }}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${section.label || `section ${i + 1}`}`}
            accessibilityState={{ selected }}
            style={{
              borderRadius: t.radii.pill,
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: selected ? t.colors.accent : t.colors.surfaceAlt,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: selected ? t.colors.onAccent : t.colors.sec,
              }}
            >
              {abbrev(section.label || '', i)}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
