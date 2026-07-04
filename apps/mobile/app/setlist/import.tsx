import { useLocalSearchParams } from 'expo-router'
import SetlistImportScreen from '../../src/screens/SetlistImportScreen'

// Shared-setlist IMPORT preview. Reached via a shared-link deep link
// (app/+native-intent.tsx remaps /setlist/<slugs>?toKeys=, /set/<CODE>, and the
// /worship/... variants here) and directly navigable for testing. The static
// `import` segment takes precedence over the dynamic `setlist/[id]` route.
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default function SetlistImportRoute() {
  const { ids, toKeys, code } = useLocalSearchParams<{
    ids?: string | string[]
    toKeys?: string | string[]
    code?: string | string[]
  }>()
  return <SetlistImportScreen ids={first(ids)} toKeys={first(toKeys)} code={first(code)} />
}
