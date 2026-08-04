import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import * as SplashScreen from 'expo-splash-screen'
import { darkColors, lightColors } from '@gracechords/tokens/native'
import { useAccessibilityFlags } from '../lib/accessibilityFlags'

// The handoff out of the native splash. This view is drawn to be PIXEL-IDENTICAL
// to the native splash (same background, same mark, same size, same position),
// so swapping one for the other is invisible; it then zooms the mark out and
// cross-fades to reveal the app already mounted underneath.
//
// Ordering is the whole trick: mount → wait until this view has both laid out
// and decoded its image → hide the native splash → animate. Hiding the native
// splash any earlier flashes a frame of app content.
//
// Mounted by app/_layout.tsx when the auth gate settles; it owns the only
// hideAsync() call on the normal launch path.

/**
 * Mark width in points. MUST match `expo-splash-screen`'s `imageWidth` in
 * app.json — that is what makes the handoff seamless. Change both together.
 */
export const SPLASH_IMAGE_WIDTH = 200

const ZOOM_TO = 1.22
const ZOOM_MS = 340
const FADE_MS = 300
// The zoom leads, the fade trails a beat behind it. Both curves matter: the mark
// has to do most of its growing while it is still opaque (Easing.out), or the
// bloom happens invisibly behind a mark that has already faded and the whole
// thing reads as a plain dissolve.
const FADE_DELAY_MS = 40
// If onLayout/onLoadEnd or the animation callback never land, lift the splash
// and unmount anyway rather than covering the app forever.
const FAILSAFE_MS = 1200

// Static requires so Metro bundles both tints; the mark PNGs are transparent
// (assets/README.md) — the opaque app icon must never be used here.
const MARK_LIGHT = require('../../assets/splash-icon.png')
const MARK_DARK = require('../../assets/splash-icon-dark.png')

export default function SplashOverlay({ onDone }: { onDone: () => void }) {
  // Deliberately the SYSTEM appearance, not the app theme: the native splash
  // picked its light/dark variant from the system, and Settings lets the user
  // force a theme that differs from it. Matching the theme here would show a
  // visible background jump at the handoff.
  const dark = (useColorScheme() ?? 'light') === 'dark'
  // Reduce Motion: no zoom, no fade — the overlay just lets go.
  const { reduceMotion } = useAccessibilityFlags()

  const opacity = useSharedValue(1)
  const scale = useSharedValue(1)
  const [laidOut, setLaidOut] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const started = useRef(false)
  const done = useRef(false)

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    onDone()
  }, [onDone])

  useEffect(() => {
    if (!laidOut || !loaded || started.current) return
    started.current = true
    let fired = false
    // One more frame so the pixels are actually on screen before the native
    // splash comes down.
    const frame = requestAnimationFrame(() => {
      fired = true
      SplashScreen.hideAsync().catch(() => {})
      if (reduceMotion) {
        opacity.value = 0
        finish()
        return
      }
      scale.value = withTiming(ZOOM_TO, {
        duration: ZOOM_MS,
        easing: Easing.out(Easing.cubic),
      })
      opacity.value = withDelay(
        FADE_DELAY_MS,
        withTiming(
          0,
          { duration: FADE_MS, easing: Easing.in(Easing.quad) },
          (completed) => {
            if (completed) runOnJS(finish)()
          },
        ),
      )
    })
    return () => {
      cancelAnimationFrame(frame)
      // Reduce Motion flipping in this one-frame window would otherwise cancel
      // the handoff and leave the native splash up until the failsafe.
      if (!fired) started.current = false
    }
  }, [laidOut, loaded, reduceMotion, opacity, scale, finish])

  useEffect(() => {
    const id = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {})
      finish()
    }, FAILSAFE_MS)
    return () => clearTimeout(id)
  }, [finish])

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={() => setLaidOut(true)}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: dark ? darkColors.bg : lightColors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        containerStyle,
      ]}
    >
      <Animated.Image
        source={dark ? MARK_DARK : MARK_LIGHT}
        // Mirrors the storyboard's scaleAspectFit (the source is square, so this
        // is only belt-and-braces against a future non-square mark).
        resizeMode="contain"
        onLoadEnd={() => setLoaded(true)}
        style={[
          { width: SPLASH_IMAGE_WIDTH, height: SPLASH_IMAGE_WIDTH },
          markStyle,
        ]}
      />
    </Animated.View>
  )
}
