import { describe, expect, it } from 'vitest'
import { formatKeyPair } from '../keyDisplay'

// A stand-in translator: returns the key and its interpolations so a test can
// assert WHICH string was chosen without depending on the English wording.
const tx = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}(${JSON.stringify(options)})` : key

describe('formatKeyPair', () => {
  it('shows the song key alone when nothing is transposed', () => {
    const result = formatKeyPair('C', null, tx)
    expect(result?.text).toBe('C')
    expect(result?.a11yLabel).toBe('common:keyOf({"key":"C"})')
  })

  it('shows the song key alone when the working key matches it', () => {
    // The Viewer mirrors its effective key into recents on every change, so an
    // untransposed song still stores a lastKey — equal to its own key.
    expect(formatKeyPair('C', 'C', tx)?.text).toBe('C')
  })

  it('shows the pair when the working key differs', () => {
    const result = formatKeyPair('C', 'D', tx)
    expect(result?.text).toBe('common:keyTransposed({"from":"C","to":"D"})')
    expect(result?.a11yLabel).toBe('common:keyTransposedA11y({"from":"C","to":"D"})')
  })

  it('falls back to the working key when the song has no key of its own', () => {
    // There is no honest "from" to show, so a pair would be an invention.
    const result = formatKeyPair(null, 'D', tx)
    expect(result?.text).toBe('D')
    expect(result?.a11yLabel).toBe('common:keyOf({"key":"D"})')
  })

  it('returns null when there is no key at all, so the caller can drop the slot', () => {
    expect(formatKeyPair(null, null, tx)).toBeNull()
    expect(formatKeyPair(undefined, undefined, tx)).toBeNull()
  })

  it('treats blank and whitespace-only keys as absent', () => {
    expect(formatKeyPair('', '   ', tx)).toBeNull()
    expect(formatKeyPair('C', '   ', tx)?.text).toBe('C')
    // A padded value must not read as a transposition of its own trimmed self.
    expect(formatKeyPair('C', ' C ', tx)?.text).toBe('C')
  })
})
