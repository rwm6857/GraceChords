import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetReaderReminderForTest,
  DEFAULT_READER_REMINDER,
  formatReminderTime,
  getReaderReminder,
  hydrateReaderReminder,
  REMINDER_NOTIFICATION_ID,
  setReminderEnabled,
  setReminderTime,
  syncReminder,
  type NotificationBackend,
  type ReminderContent,
} from '../readerReminder'
import type { KVStorage } from '../defaults'

function memoryStorage(initial: Record<string, string> = {}): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

const CONTENT: ReminderContent = { title: 'Daily Word', body: 'Time to read' }

function fakeBackend(granted = true) {
  return {
    getPermissionGranted: vi.fn(async () => granted),
    requestPermission: vi.fn(async () => granted),
    cancel: vi.fn(async () => {}),
    scheduleDaily: vi.fn(async () => {}),
  } satisfies NotificationBackend
}

describe('reader reminder store', () => {
  beforeEach(() => __resetReaderReminderForTest())

  it('is disabled at 08:00 by default', async () => {
    await hydrateReaderReminder(memoryStorage())
    expect(getReaderReminder()).toEqual(DEFAULT_READER_REMINDER)
    expect(getReaderReminder()).toEqual({ enabled: false, hour: 8, minute: 0 })
  })

  it('persists enable state and time across a simulated reload', async () => {
    const s = memoryStorage()
    await hydrateReaderReminder(s)
    setReminderEnabled(true)
    setReminderTime(6, 30)

    __resetReaderReminderForTest()
    await hydrateReaderReminder(s)
    expect(getReaderReminder()).toEqual({ enabled: true, hour: 6, minute: 30 })
  })

  it('clamps out-of-range and non-integer times', async () => {
    await hydrateReaderReminder(memoryStorage())
    setReminderTime(30, -5)
    expect(getReaderReminder()).toMatchObject({ hour: 23, minute: 0 })
    setReminderTime(7.9, 61)
    expect(getReaderReminder()).toMatchObject({ hour: 7, minute: 59 })
  })

  it('clamps a stored out-of-range time on hydrate', async () => {
    const s = memoryStorage({
      'gc.readerReminder.v1': JSON.stringify({ enabled: true, hour: 99, minute: 99 }),
    })
    await hydrateReaderReminder(s)
    expect(getReaderReminder()).toEqual({ enabled: true, hour: 23, minute: 59 })
  })

  it('falls back to the disabled default on a corrupt read', async () => {
    await hydrateReaderReminder(memoryStorage({ 'gc.readerReminder.v1': '{not json' }))
    expect(getReaderReminder()).toEqual(DEFAULT_READER_REMINDER)
  })
})

describe('formatReminderTime', () => {
  it('formats morning and evening times in en-US', () => {
    expect(formatReminderTime(8, 0, 'en-US')).toBe('8:00 AM')
    expect(formatReminderTime(20, 5, 'en-US')).toBe('8:05 PM')
  })
})

describe('syncReminder', () => {
  it('cancels and does not schedule when disabled', async () => {
    const backend = fakeBackend(true)
    await syncReminder({ enabled: false, hour: 8, minute: 0 }, CONTENT, backend)
    expect(backend.cancel).toHaveBeenCalledWith(REMINDER_NOTIFICATION_ID)
    expect(backend.scheduleDaily).not.toHaveBeenCalled()
  })

  it('reschedules when enabled and permission is held', async () => {
    const backend = fakeBackend(true)
    await syncReminder({ enabled: true, hour: 7, minute: 15 }, CONTENT, backend)
    expect(backend.cancel).toHaveBeenCalledWith(REMINDER_NOTIFICATION_ID)
    expect(backend.scheduleDaily).toHaveBeenCalledWith(REMINDER_NOTIFICATION_ID, 7, 15, CONTENT)
  })

  it('does not schedule when enabled but permission is missing', async () => {
    const backend = fakeBackend(false)
    await syncReminder({ enabled: true, hour: 7, minute: 15 }, CONTENT, backend)
    expect(backend.cancel).toHaveBeenCalledWith(REMINDER_NOTIFICATION_ID)
    expect(backend.scheduleDaily).not.toHaveBeenCalled()
  })
})
