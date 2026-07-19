import { describe, it, expect } from 'vitest'
import { mapSubmitResult } from '../reflectionsApiMap'

describe('mapSubmitResult', () => {
  it('201 with allowed+id → posted', () => {
    expect(mapSubmitResult(201, { allowed: true, id: 'r1' })).toEqual({ status: 'posted', id: 'r1' })
  })
  it('200 allowed=false → rejected with reasons', () => {
    expect(mapSubmitResult(200, { allowed: false, reasons: ['contains_url'] })).toEqual({
      status: 'rejected',
      reasons: ['contains_url'],
    })
  })
  it('200 allowed=false with no reasons → empty reasons', () => {
    expect(mapSubmitResult(200, { allowed: false })).toEqual({ status: 'rejected', reasons: [] })
  })
  it('409 → already_posted', () => {
    expect(mapSubmitResult(409, { error: 'already_posted_today' })).toEqual({ status: 'already_posted' })
  })
  it('403 banned vs disabled', () => {
    expect(mapSubmitResult(403, { error: 'banned' })).toEqual({ status: 'banned' })
    expect(mapSubmitResult(403, { error: 'public_reflections_disabled' })).toEqual({ status: 'disabled' })
  })
  it('503 → unavailable (fail-closed retry)', () => {
    expect(mapSubmitResult(503, { error: 'moderation_unavailable' })).toEqual({ status: 'unavailable' })
  })
  it('unexpected shapes → null (caller throws)', () => {
    expect(mapSubmitResult(200, { allowed: true })).toBeNull() // missing id
    expect(mapSubmitResult(500, { error: 'boom' })).toBeNull()
    expect(mapSubmitResult(400, null)).toBeNull()
  })
})
