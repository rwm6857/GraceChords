import ChangePasswordScreen from '../../src/screens/ChangePasswordScreen'

// Account → Change password. Only reachable when the account carries an `email`
// identity; AccountScreen hides the row otherwise.
export default function ChangePassword() {
  return <ChangePasswordScreen />
}
