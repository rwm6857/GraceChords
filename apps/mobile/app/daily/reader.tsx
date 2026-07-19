import DailyWordScreen from '../../src/screens/DailyWordScreen'

// The M'Cheyne Reader pushed from the Daily Word landing — it carries a back
// chevron to the landing (the tab-root Reader in reader-direct mode does not).
export default function DailyReader() {
  return <DailyWordScreen showBackToLanding />
}
