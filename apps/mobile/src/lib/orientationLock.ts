import * as Device from 'expo-device'
import * as ScreenOrientation from 'expo-screen-orientation'

// Orientation policy: phones stay portrait (both platforms), tablets rotate
// freely. `app.json` sets `orientation: "default"` so the native manifest /
// Info.plist allow every orientation; this narrows that per device class at
// runtime. This is what unblocks the tablet UI on Android — a portrait-locked
// activity is treated as non-resizeable on large screens and gets letterboxed
// into a phone-sized compat window, so `useIsTabletWidth` (≥ 600pt) never
// fires. Letting tablets fill the screen (and rotate to landscape) is what the
// existing split-view / grid / two-column layouts key off of. iPad already
// behaved this way; this brings Android tablets in line.
export async function applyOrientationLock(): Promise<void> {
  try {
    const type = await Device.getDeviceTypeAsync()
    if (type === Device.DeviceType.TABLET) {
      // Tablets: allow all orientations. The landscape 3-column library grid
      // and the two-column chart mode depend on this.
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL)
    } else {
      // Phones (and unknown/desktop/TV — safest default): lock to portrait,
      // preserving the app's prior behavior.
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      )
    }
  } catch {
    // Non-fatal: if the native module is unavailable (e.g. an old dev client
    // that predates this dependency), fall back to whatever the OS chooses.
  }
}
