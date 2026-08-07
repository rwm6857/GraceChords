import AccountScreen from '../../src/screens/AccountScreen'

// Account — pushed from the Profile & Settings header card. A folder route
// rather than a flat file because this area owns a sub-route (password), the
// same shape as app/daily/ and app/setlist/.
export default function Account() {
  return <AccountScreen />
}
