import { Redirect } from 'expo-router'

// SPIKE-ONLY route: on-device probe for the tuner audio pipeline, kept for
// device-verifying the pipeline numbers (spike/tuner/RESULTS.md). The __DEV__
// guard is compile-time (babel constant-folds it), so the spike harness is
// excluded from production bundles entirely; release builds just redirect.
export default function TunerSpike() {
  if (__DEV__) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TunerSpikeScreen = require('../../spike/tuner/TunerSpikeScreen').default
    return <TunerSpikeScreen />
  }
  return <Redirect href="/" />
}
