import '@testing-library/jest-dom'

// Provide a lightweight fetch mock for tests that hit /src/data/index.json or /public/songs/*.chordpro
beforeAll(() => {
  global.fetch = async (url) => {
    // Minimal fake index
    if (String(url).includes('/src/data/index.json')) {
      return new Response(JSON.stringify({ songs: [] }), { status: 200 })
    }
    // Any other asset -> empty text
    return new Response('', { status: 200 })
  }
})