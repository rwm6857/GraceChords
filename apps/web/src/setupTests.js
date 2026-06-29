import '@testing-library/jest-dom/vitest'
import i18n from './i18n'

// Lightweight default fetch stub. Song data now comes from Supabase via the
// useSongs() hook (tests mock that hook directly), so this only needs to keep
// incidental asset fetches (e.g. Bible manifests, pptx HEAD checks) from
// hitting the network. Any request resolves to an empty 200.
beforeAll(() => {
  global.fetch = async () => new Response('', { status: 200 })
})

// Reset to English before each test so existing assertions on English text
// remain stable regardless of detector/localStorage state.
beforeEach(() => {
  if (i18n.language !== 'en') i18n.changeLanguage('en')
})