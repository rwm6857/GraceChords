import TunerSpikeScreen from '../../spike/tuner/TunerSpikeScreen'

// SPIKE-ONLY route: on-device probe for the tuner audio pipeline. Reached from
// the Utilities tab's Tuner row in __DEV__ builds; delete with spike/tuner/
// when the real tuner ships.
export default function TunerSpike() {
  return <TunerSpikeScreen />
}
